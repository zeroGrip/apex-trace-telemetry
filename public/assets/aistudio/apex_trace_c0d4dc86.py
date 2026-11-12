#!/usr/bin/env python3
"""Offline tools for an apex-trace archive.

An archive is either a `.apex.zip` or an unpacked directory of the same entries.
Nothing here launches the game, so it is the first thing to run when a recording
looks wrong:

    uv run --with jsonschema python tools/apex_trace.py validate path/to/x.apex.zip
    python tools/apex_trace.py validate tests/out/sample      # no schema, rules only
    python tools/apex_trace.py inspect  tests/out/sample
    python tools/apex_trace.py dump     tests/out/sample dump_car.json

`validate` checks two things, and says which is which:

  * the schema (schema/apex-trace.schema.json) -- what the entries are allowed to
    contain. Needs `jsonschema`; skipped with a warning when it is not installed;
  * the archive's own consistency -- entry order, contiguous chunk numbering, the
    channel keys a frame carries against the ones the manifest declares, coverage
    counters against the frames actually in the file, monotonic time, lap events
    matching the frames around them. These run on the standard library alone.

Exit codes: 0 clean, 1 something is wrong, 2 the archive could not be read.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import zipfile
from pathlib import Path
from typing import Iterator

ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = ROOT / "schema" / "apex-trace.schema.json"

FRAME_ENTRY = re.compile(r"^frames/(\d{4})\.ndjson$")
LINE_KINDS = ("frame", "lap", "sector", "note")


class ArchiveError(Exception):
    """The input is not an archive we can read at all."""


class Report:
    """Problems and warnings, in the order they were found."""

    def __init__(self) -> None:
        self.problems: list[str] = []
        self.warnings: list[str] = []

    def problem(self, message: str) -> None:
        self.problems.append(message)

    def warn(self, message: str) -> None:
        self.warnings.append(message)

    @property
    def ok(self) -> bool:
        return not self.problems

    def print(self) -> None:
        for message in self.problems:
            print(f"error   {message}")
        for message in self.warnings:
            print(f"warning {message}")
        if self.ok:
            print(f"ok      {len(self.warnings)} warning(s)" if self.warnings else "ok")


class Archive:
    """Read-only view over a zip or an unpacked directory."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.is_zip = path.is_file() and zipfile.is_zipfile(path)
        self._zip: zipfile.ZipFile | None = None
        self.entries: list[str] = []
        self.by_name: dict[str, str] = {}

        if self.is_zip:
            self._zip = zipfile.ZipFile(path)
            infos = self._zip.infolist()
            self.entries = [info.filename for info in infos if not info.is_dir()]
            self.by_name = {info.filename: info.filename for info in infos if not info.is_dir()}
        elif path.is_dir():
            for child in sorted(path.rglob("*")):
                if child.is_file():
                    name = child.relative_to(path).as_posix()
                    self.entries.append(name)
                    self.by_name[name] = str(child)
        else:
            raise ArchiveError(f"not a zip and not a directory: {path}")

        if "manifest.json" not in self.by_name:
            raise ArchiveError(f"{path} has no manifest.json")

    def read(self, name: str) -> bytes:
        if name not in self.by_name:
            raise ArchiveError(f"no entry named {name}")
        if self._zip is not None:
            return self._zip.read(name)
        return Path(self.by_name[name]).read_bytes()

    def text(self, name: str) -> str:
        return self.read(name).decode("utf-8")

    def json(self, name: str) -> dict:
        try:
            value = json.loads(self.text(name))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ArchiveError(f"{name} is not JSON: {error}") from error
        if not isinstance(value, dict):
            raise ArchiveError(f"{name} is not a JSON object")
        return value

    def frame_entries(self) -> list[str]:
        found = [name for name in self.entries if FRAME_ENTRY.match(name)]
        return sorted(found)

    def close(self) -> None:
        if self._zip is not None:
            self._zip.close()

    def __enter__(self) -> "Archive":
        return self

    def __exit__(self, *_: object) -> None:
        self.close()


VALIDATED_DEFS = ("manifest", "summary", "track", "dump", "line")


def schema_validator() -> dict | None:
    """One validator per $defs entry, or None when jsonschema is missing.

    The schema's root is a bag of definitions, not a document schema: validating a
    frame against it would accept anything, so each entry is validated against its own
    definition.
    """
    if not SCHEMA_PATH.is_file():
        raise ArchiveError(f"schema not found at {SCHEMA_PATH}")
    try:
        import jsonschema
    except ImportError:
        return None
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    definitions = schema["$defs"]
    checkers = {}
    for name in VALIDATED_DEFS:
        checkers[name] = jsonschema.Draft202012Validator(
            {"$ref": f"#/$defs/{name}", "$defs": definitions},
            format_checker=jsonschema.FormatChecker(),
        )
    return checkers


def root_cause(error):
    """The useful part of a `oneOf` failure: the branch that got furthest.

    A frame that fails because one channel is a string also fails the `lap`, `sector`
    and `note` branches at `k`. Reporting the outer "not valid under any of the given
    schemas" hides the one line that matters.
    """
    while error.context:
        deeper = [child for child in error.context if list(child.absolute_path)]
        if not deeper:
            break
        error = max(deeper, key=lambda child: len(list(child.absolute_path)))
    return error


def path_of(error) -> str:
    return "/".join(str(part) for part in error.absolute_path) or "(root)"


def check_schema(report: Report, validators, kind: str, name: str, document: dict) -> None:
    if validators is None:
        return
    validator = validators[kind]
    errors = sorted(validator.iter_errors(document), key=lambda error: list(error.absolute_path))
    for error in errors[:5]:
        cause = root_cause(error)
        report.problem(f"{name}: {path_of(cause)}: {cause.message}")


def check_schema_line(report: Report, validators, name: str, lhs: int, document: dict) -> None:
    if validators is None:
        return
    validator = validators["line"]
    if validator.is_valid(document):
        return
    errors = sorted(validator.iter_errors(document), key=lambda error: list(error.absolute_path))
    cause = root_cause(errors[0])
    report.problem(f"{name}:{lhs}: {path_of(cause)}: {cause.message}")


def check_entries(report: Report, archive: Archive, manifest: dict) -> str | None:
    """Entry order and chunk numbering. Returns the summary text, if there is one."""
    entries = archive.entries
    # A directory has no write order; its entries are listed by name. Order is a
    # property of the zip, and a zip is the format the game writes.
    if archive.is_zip and entries[0] != "manifest.json":
        report.problem(f"first entry is {entries[0]!r}, expected manifest.json")

    frames = archive.frame_entries()
    if not frames:
        report.problem("no frames/NNNN.ndjson entry")
        return None

    indices = [int(FRAME_ENTRY.match(name).group(1)) for name in frames]  # type: ignore[union-attr]
    if indices[0] != 1:
        report.problem(f"chunks start at {indices[0]:04d}, expected 0001")
    for previous, current in zip(indices, indices[1:]):
        if current != previous + 1:
            report.problem(f"chunk number jumps from {previous:04d} to {current:04d}")

    if manifest.get("track", {}).get("spline") is True and "track.json" not in archive.by_name:
        report.problem("manifest says the spline was written, but track.json is missing")

    if "summary.json" in archive.by_name:
        if archive.is_zip and entries[-1] != "summary.json":
            report.problem(f"last entry is {entries[-1]!r}, expected summary.json")
        return "summary.json"

    report.warn("no summary.json: the recording did not stop cleanly (frames up to the last chunk are still valid)")
    return None


class Stream:
    """What one pass over the NDJSON chunks learns, without keeping the frames."""

    def __init__(self, manifest: dict) -> None:
        self.frame_channels: list[str] = list(manifest.get("channels", {}).get("frame", []))
        self.wheel_channels: list[str] = list(manifest.get("channels", {}).get("wheels", []))
        self.frames = 0
        self.lines = 0
        self.laps: list[dict] = []
        self.sectors = 0
        self.notes: list[dict] = []
        self.first_t: float | None = None
        self.last_t: float | None = None
        self.first_c: float | None = None
        self.last_c: float | None = None
        self.present: dict[str, int] = {key: 0 for key in self.frame_channels}
        self.wheel_present: dict[str, int] = {key: 0 for key in self.wheel_channels}
        self.last_lap: int | None = None


def scan(report: Report, archive: Archive, manifest: dict, validator, stream: Stream) -> None:
    """Walk every chunk once, validating lines and collecting the counters."""
    last_t: float | None = None
    last_c: float | None = None

    for name in archive.frame_entries():
        try:
            text = archive.text(name)
        except ArchiveError as error:
            report.problem(str(error))
            continue
        if not text.endswith("\n"):
            report.warn(f"{name}: the last line is not newline-terminated")

        for number, raw in enumerate(text.split("\n"), start=1):
            if raw == "":
                continue
            stream.lines += 1
            try:
                line = json.loads(raw)
            except json.JSONDecodeError as error:
                report.problem(f"{name}:{number}: not JSON: {error}")
                continue
            if not isinstance(line, dict):
                report.problem(f"{name}:{number}: not a JSON object")
                continue

            kind = line.get("k")
            if kind not in LINE_KINDS:
                report.problem(f"{name}:{number}: unknown k={kind!r}")
                continue
            check_schema_line(report, validator, name, number, line)

            clock = line.get("c")
            if isinstance(clock, (int, float)):
                if last_c is not None and clock < last_c:
                    report.problem(f"{name}:{number}: c went backwards ({clock} after {last_c})")
                last_c = clock
                if stream.first_c is None:
                    stream.first_c = clock
                stream.last_c = clock

            if kind != "frame":
                if kind == "lap":
                    stream.laps.append(line)
                    if stream.last_lap is not None and line.get("n") != stream.last_lap:
                        report.problem(
                            f"{name}:{number}: lap event n={line.get('n')} does not match "
                            f"the preceding frame's lapCount={stream.last_lap}"
                        )
                elif kind == "sector":
                    stream.sectors += 1
                else:
                    stream.notes.append(line)
                continue

            stamp = line.get("t")
            if not isinstance(stamp, (int, float)):
                report.problem(f"{name}:{number}: frame has no numeric t")
            else:
                if last_t is not None and stamp <= last_t:
                    report.problem(f"{name}:{number}: t did not advance ({stamp} after {last_t})")
                last_t = stamp
                if stream.first_t is None:
                    stream.first_t = stamp
                stream.last_t = stamp

            frame = line.get("f")
            if not isinstance(frame, dict):
                report.problem(f"{name}:{number}: frame has no f object")
                frame = {}
            else:
                declared = set(stream.frame_channels)
                written = set(frame)
                for key in sorted(declared - written):
                    report.problem(f"{name}:{number}: frame is missing the declared channel {key!r}")
                for key in sorted(written - declared):
                    report.problem(f"{name}:{number}: frame carries undeclared channel {key!r}")
                for key in stream.frame_channels:
                    if frame.get(key) is not None:
                        stream.present[key] = stream.present.get(key, 0) + 1

            wheels = line.get("w")
            if not isinstance(wheels, list) or len(wheels) != 4:
                report.problem(f"{name}:{number}: frame has {len(wheels) if isinstance(wheels, list) else 0} wheels, expected 4")
            else:
                for corner, wheel in enumerate(wheels):
                    if not isinstance(wheel, dict):
                        report.problem(f"{name}:{number}: wheel {corner} is not an object")
                        continue
                    written = set(wheel)
                    declared = set(stream.wheel_channels)
                    for key in sorted(declared - written):
                        report.problem(
                            f"{name}:{number}: wheel {corner} is missing the declared channel {key!r}"
                        )
                    for key in sorted(written - declared):
                        report.problem(
                            f"{name}:{number}: wheel {corner} carries undeclared channel {key!r}"
                        )
                    for key in stream.wheel_channels:
                        if wheel.get(key) is not None:
                            stream.wheel_present[key] = stream.wheel_present.get(key, 0) + 1

            lap = line.get("lap")
            stream.last_lap = lap if isinstance(lap, int) else None
            stream.frames += 1


MAX_COVERAGE_ERRORS = 6


def check_coverage(report: Report, summary: dict, stream: Stream) -> None:
    rows = summary.get("coverage")
    if not isinstance(rows, list):
        report.problem("summary.coverage is not an array")
        return

    by_id: dict[str, dict] = {}
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("id"), str):
            report.problem("summary.coverage has a row without an id")
            continue
        if row["id"] in by_id:
            report.problem(f"summary.coverage lists {row['id']!r} twice")
        by_id[row["id"]] = row

    expected_frame = {key: (stream.present.get(key, 0), stream.frames) for key in stream.frame_channels}
    expected_wheel = {
        "w." + key: (stream.wheel_present.get(key, 0), stream.frames * 4) for key in stream.wheel_channels
    }
    expected = {**expected_frame, **expected_wheel}

    # A truncated archive disagrees on every row at once. Saying so a hundred times
    # buries the cause, which is always the same one: fewer frames than the summary
    # counted.
    wrong = 0
    for key, (present, total) in expected.items():
        row = by_id.get(key)
        if row is None:
            wrong += 1
            if wrong <= MAX_COVERAGE_ERRORS:
                report.problem(f"summary.coverage does not mention the declared channel {key!r}")
            continue
        if row.get("present") != present:
            wrong += 1
            if wrong <= MAX_COVERAGE_ERRORS:
                report.problem(f"summary.coverage {key}: present={row.get('present')}, frames say {present}")
        if row.get("total") != total:
            wrong += 1
            if wrong <= MAX_COVERAGE_ERRORS:
                report.problem(f"summary.coverage {key}: total={row.get('total')}, frames say {total}")
        scope = "wheel" if key.startswith("w.") else "frame"
        if row.get("scope") != scope:
            wrong += 1
            if wrong <= MAX_COVERAGE_ERRORS:
                report.problem(f"summary.coverage {key}: scope={row.get('scope')!r}, expected {scope!r}")
    if wrong > MAX_COVERAGE_ERRORS:
        report.problem(f"summary.coverage: {wrong - MAX_COVERAGE_ERRORS} more rows disagree with the frames")

    for key in sorted(set(by_id) - set(expected)):
        report.warn(f"summary.coverage mentions {key!r}, which the manifest does not declare")


def check_summary(report: Report, summary: dict, stream: Stream, session_id: str | None, chunks: int) -> None:
    if summary.get("sessionId") != session_id:
        report.problem("summary.sessionId does not match the manifest")
    if summary.get("frames") != stream.frames:
        report.problem(f"summary.frames={summary.get('frames')}, the chunks hold {stream.frames}")
    if summary.get("chunks") != chunks:
        report.problem(f"summary.chunks={summary.get('chunks')}, the archive holds {chunks}")
    if summary.get("laps") != len(stream.laps):
        report.problem(f"summary.laps={summary.get('laps')}, the chunks hold {len(stream.laps)} lap events")
    if summary.get("status") != "closed":
        report.problem(f"summary.status={summary.get('status')!r}, expected 'closed'")
    if stream.last_c is not None and isinstance(summary.get("durationS"), (int, float)):
        if summary["durationS"] + 0.5 < stream.last_c:
            report.problem(
                f"summary.durationS={summary['durationS']} is shorter than the last frame's c={stream.last_c}"
            )


def check_track(report: Report, archive: Archive, manifest: dict) -> None:
    if "track.json" not in archive.by_name:
        return
    document = archive.json("track.json")
    points = document.get("points")
    if not isinstance(points, list) or len(points) < 2:
        report.problem("track.json has fewer than two points")
        return
    first, last = points[0], points[-1]
    closed = document.get("track", {}).get("closed")
    if closed is True and first != last:
        report.problem("track.json is marked closed but its first and last points differ")
    length = document.get("track", {}).get("lengthM")
    if length != manifest.get("track", {}).get("lengthM"):
        report.warn("track.json and manifest.json disagree on lengthM")


def dump_entry(archive: Archive, name: str) -> None:
    try:
        sys.stdout.write(archive.text(name))
    except UnicodeDecodeError:
        sys.stdout.buffer.write(archive.read(name))


def inspect(archive: Archive, as_json: bool) -> int:
    manifest = archive.json("manifest.json")
    summary = archive.json("summary.json") if "summary.json" in archive.by_name else None
    stream = Stream(manifest)
    quiet = Report()
    scan(quiet, archive, manifest, None, stream)

    frames = archive.frame_entries()
    track_points = None
    if "track.json" in archive.by_name:
        track_points = len(archive.json("track.json").get("points", []))

    if as_json:
        document = {
            "path": str(archive.path),
            "manifest": manifest,
            "summary": summary,
            "chunks": frames,
            "frames": stream.frames,
            "laps": stream.laps,
            "sectors": stream.sectors,
            "notes": stream.notes,
            "trackPoints": track_points,
            "coverage": [
                {
                    "id": key,
                    "present": stream.present.get(key, 0),
                    "total": stream.frames,
                }
                for key in stream.frame_channels
            ]
            + [
                {
                    "id": "w." + key,
                    "present": stream.wheel_present.get(key, 0),
                    "total": stream.frames * 4,
                }
                for key in stream.wheel_channels
            ],
        }
        print(json.dumps(document, indent=2, ensure_ascii=False))
        return 0 if quiet.ok else 1

    target = manifest.get("target", {})
    track = manifest.get("track", {})
    sim = manifest.get("sim", {})
    duration = (stream.last_c - stream.first_c) if stream.first_c is not None else 0.0
    print(f"{archive.path}")
    print(f"  app          {manifest.get('app')} {manifest.get('version')}, schema {manifest.get('schema')}")
    print(f"  session      {manifest.get('sessionId')}  started {manifest.get('startedUtc')}")
    print(f"  target       {target.get('driverName')}  model {target.get('carModel')}  remote {target.get('isRemote')}")
    print(
        f"  track        {track.get('name') or track.get('id')}  layout {track.get('layout')}  "
        f"{track.get('lengthM')} m  spline {track.get('spline')} ({track.get('splineSource')})"
    )
    print(
        f"  conditions   ambient {sim.get('ambientC')} C  road {sim.get('roadC')} C  "
        f"grip {sim.get('grip')}  session type {sim.get('sessionType')}"
    )
    print(f"  chunks       {len(frames)}  {' '.join(frames)}")
    if track_points is not None:
        print(f"  track points {track_points}")
    print(
        f"  frames       {stream.frames}  t {stream.first_t} -> {stream.last_t} ms  "
        f"c {duration:.1f} s"
    )
    if summary is not None:
        print(
            f"  summary      {summary.get('status')} ({summary.get('reason')})  "
            f"{summary.get('laps')} laps  {summary.get('bytes')} bytes"
        )
    else:
        print("  summary      none (the recording did not stop cleanly)")

    for lap in stream.laps:
        validity = {True: "valid", False: "invalid", None: "unknown"}[lap.get("valid")]
        print(f"  lap {lap.get('n')}        {lap.get('timeMs')} ms  {validity}  cuts {lap.get('cuts')}")

    missing = [row for row in manifest.get("channels", {}).get("frame", []) if stream.present.get(row, 0) == 0]
    missing += [
        "w." + row for row in manifest.get("channels", {}).get("wheels", []) if stream.wheel_present.get(row, 0) == 0
    ]
    if missing:
        print(f"  never seen   {', '.join(missing)}")
    return 0 if quiet.ok else 1


def validate(path: Path, quick: bool) -> int:
    report = Report()
    try:
        with Archive(path) as archive:
            manifest = archive.json("manifest.json")

            validator = None if quick else schema_validator()
            if validator is None and not quick:
                report.warn("jsonschema is not installed: only the archive's own rules were checked")
            check_schema(report, validator, "manifest", "manifest.json", manifest)

            summary_name = check_entries(report, archive, manifest)
            frames = archive.frame_entries()

            stream = Stream(manifest)
            scan(report, archive, manifest, validator, stream)

            if summary_name is not None:
                summary = archive.json(summary_name)
                check_schema(report, validator, "summary", summary_name, summary)
                check_summary(report, summary, stream, manifest.get("sessionId"), len(frames))
                check_coverage(report, summary, stream)
            elif stream.frames > 0:
                report.warn(f"{stream.frames} frames, no coverage summary to compare them with")

            if "track.json" in archive.by_name:
                check_schema(report, validator, "track", "track.json", archive.json("track.json"))
                check_track(report, archive, manifest)
            if "dump_car.json" in archive.by_name:
                check_schema(report, validator, "dump", "dump_car.json", archive.json("dump_car.json"))

            report.print()
            if report.ok:
                print(f"        {len(frames)} chunk(s), {stream.frames} frames, {len(stream.laps)} lap(s)")
            return 0 if report.ok else 1
    except (ArchiveError, OSError, zipfile.BadZipFile) as error:
        print(f"error   {error}")
        return 2


def pack(directory: Path, target: Path) -> int:
    """The mirror of `unzip`: manifest, track, frames in order, dump, summary.

    Useful after hand-fixing an archive, and the only way to exercise the zip path of
    `validate` on the sample the offline checks produce (that harness writes a
    directory, because Lua 5.1 has no zip library).
    """
    with Archive(directory) as archive:
        manifest = archive.json("manifest.json")
        frames = archive.frame_entries()
        order = ["manifest.json"]
        if "track.json" in archive.by_name:
            order.append("track.json")
        order.extend(frames)
        if "dump_car.json" in archive.by_name:
            order.append("dump_car.json")
        if "summary.json" in archive.by_name:
            order.append("summary.json")
        extra = [name for name in archive.entries if name not in order]
        if extra:
            print(f"warning ignoring unexpected entries: {', '.join(extra)}", file=sys.stderr)

        target.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_DEFLATED) as bundle:
            for name in order:
                bundle.writestr(name, archive.read(name))
    print(f"packed {directory} -> {target} ({len(order)} entries)")
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    p_validate = sub.add_parser("validate", help="check an archive against the schema and its own rules")
    p_validate.add_argument("archive", type=Path)
    p_validate.add_argument(
        "--quick",
        action="store_true",
        help="skip the JSON schema and only check the archive's own consistency",
    )

    p_inspect = sub.add_parser("inspect", help="print what is inside an archive")
    p_inspect.add_argument("archive", type=Path)
    p_inspect.add_argument("--json", action="store_true", help="machine-readable output")

    p_dump = sub.add_parser("dump", help="print one entry of an archive verbatim")
    p_dump.add_argument("archive", type=Path)
    p_dump.add_argument("entry", nargs="?", help="entry name; omit to list the entries")

    p_pack = sub.add_parser("pack", help="write an unpacked archive as a zip, in the entry order the game uses")
    p_pack.add_argument("directory", type=Path)
    p_pack.add_argument("zip", type=Path)

    args = parser.parse_args(argv)

    try:
        if args.command == "pack":
            return pack(args.directory, args.zip)
        if args.command == "dump":
            with Archive(args.archive) as archive:
                if args.entry is None:
                    for name in archive.entries:
                        print(name)
                    return 0
                if args.entry not in archive.by_name:
                    print(f"error   no entry named {args.entry}", file=sys.stderr)
                    return 2
                dump_entry(archive, args.entry)
                return 0
        if args.command == "inspect":
            with Archive(args.archive) as archive:
                return inspect(archive, args.json)
        return validate(args.archive, args.quick)
    except (ArchiveError, OSError, zipfile.BadZipFile) as error:
        print(f"error   {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
