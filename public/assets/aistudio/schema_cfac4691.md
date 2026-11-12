# The archive format, schema 1

The normative contract is `schema/apex-trace.schema.json`. This file explains what the
schema cannot: which number means what, why a field is absent, and which guarantees the
reader may rely on. If the two disagree, the schema is right about shape and this file is
right about meaning; fix whichever is wrong.

An archive is one zip (`.apex.zip`) holding a small number of entries, or the same entries
unpacked in a directory (the offline checks and `tools/apex_trace.py pack/unpack` use the
directory form).

## Entries and order

| # | Entry | Always | Contents |
|---|-------|--------|----------|
| 1 | `manifest.json` | yes | identity and the channel list the file was written with |
| 2 | `track.json` | when the build exposes a spline | the circuit's AI spline, world metres |
| 3.. | `frames/NNNN.ndjson` | yes, at least one | one JSON object per line, `0001` upwards, contiguous |
| .. | `dump_car.json` | only after the Debug tab's button | one-off snapshot of the car object |
| last | `summary.json` | only after a clean stop | counts, coverage, stop reason |

The order is the order of writing, and entries are written whole. CSP has no append, so
this is also why the stream is chunked rather than one growing file (`docs/adr/0004`).

A missing `summary.json` means the recording did not stop cleanly — the game was closed,
the disk refused a write, or the file was copied mid-session. Everything up to the last
complete chunk is still valid, and its `coverage` cannot be checked because the summary is
where coverage lives.

## `manifest.json`

Written before the first frame and never rewritten, so `status` is always `"open"`.

| Field | Meaning |
|-------|---------|
| `schema` | format version, `1` |
| `app`, `version` | `"apex-trace"` and the app version that wrote the file |
| `status` | always `"open"`; the summary carries `"closed"` |
| `sessionId` | 8 hex digits, derived from track, layout, driver name and start time |
| `startedUtc`, `startedUnix` | when the archive was opened |
| `target.driverName` | the name the server shows |
| `target.sessionID` | the entry-list slot at start. It is **not** the car index and it changes when cars join or leave |
| `target.carModel`, `target.carSkin` | as the game reports them |
| `target.isRemote`, `target.isAi` | whether this was another player's car or a bot |
| `track.id`, `.layout`, `.name` | as the game reports them; `layout` is often absent |
| `track.lengthM` | the value `splinePosition` is turned into metres with. Absent when the game reports `0`, which is what it says for a layout with no AI spline — a circuit is never zero metres long, and a reader that divided by it would produce `Infinity` |
| `track.closed` | `false` for point-to-point tracks |
| `track.spline`, `.splineSource` | whether `track.json` exists, and which CSP accessor answered |
| `server.name`, `.ip`, `.httpPort` | what the session knew; the HTTP port is what a site would query later |
| `sim.online`, `.sessionType` | session kind at start |
| `sim.ambientC`, `.roadC`, `.grip` | conditions at start, not per frame |
| `channels.frame`, `.wheels` | **the exact key sets** every frame carries |
| `provenance.wheels`, `.note` | `"netcode"` for wheel fields; what was deliberately left out |

`channels` is the contract between the writer and the reader. A channel added in a later
app version appears in `channels` and in every `f`/`w` object of that file; a reader that
does not know the name can ignore it, which is why adding a channel does not bump
`schema` (`docs/adr/0006`).

## `frames/NNNN.ndjson`

UTF-8, one object per line, `\n` terminated. Four kinds, told apart by `k`:

### `frame`

```json
{"k":"frame","t":51725,"c":12.35,"lap":3,
 "f":{"position":[123.4,2.1,-455.9],"speedKmh":182.4,"gear":5, ...},
 "w":[{"tyreWear":0.21, ...},{"...":1},{"...":1},{"...":1}]}
```

- `t` — `ac.StateCar.timestamp`: the game's own packet time in milliseconds. **Strictly
  increasing** inside an archive. A packet is never written twice: this is a recording of
  what was received, not of the graphics frames between packets (`docs/adr/0002`).
- `c` — seconds since the archive was opened, from a monotonic clock. Non-decreasing;
  the recorder's time for the file, where `t` is the sender's time.
- `lap` — `lapCount` at that packet, so a reader can split frames into laps without
  scanning for events.
- `f` — the frame channels, exactly the names in `manifest.channels.frame`.
  `trackCoordinates` is the game's own conversion of `position`: `[lateral, height,
  progress]`, where lateral is `-1` at the left edge of the track, `0` on the centre line
  and `1` at the right edge, height is metres above the track, and progress is the same
  0..1 value as `splinePosition`. It is `null` on a build that has no
  `ac.worldCoordinateToTrack`, which is why the world `position` is recorded as well.
- `w` — four objects, front-left, front-right, rear-left, rear-right, exactly the names in
  `manifest.channels.wheels`. An array because JSON has no tuple.

Any field the build did not report is `null`, never `0`, and never missing
(`docs/adr/0005`). A channel that is always `null` in a file is a channel the game did not
send — the coverage table says how often.

### `lap`

```json
{"k":"lap","c":104.2,"t":612000,"n":4,"timeMs":104321,"bestMs":103998,"valid":false,"cuts":1}
```

Written after the frame in which `lapCount` changed, so the file itself fixes the order of
"the lap ended" and "the frame at the line". `n` is the new `lapCount` (the lap that just
started). `timeMs` is `previousLapTimeMs`, the lap that just ended. `valid` and `cuts` come
from `isLastLapValid` / `lastLapCutsCount`, the one validity pair a remote car reports;
`null` means the build did not send it. A lap event is always the last line before a chunk
flush.

### `sector`

```json
{"k":"sector","c":34.5,"t":201000,"n":2,"timeMs":35120}
```

`sector` updates: `n` is the sector the car has just entered, `timeMs` the previous
sector's time. Written because sector boundaries are where a comparison usually starts.

### `note`

```json
{"k":"note","c":88.0,"t":401000,"m":"reset"}
```

Something the reader must not ignore when joining frames. `reset` means the car was
teleported (back to the pits, typically): the frames before and after are not a continuous
line, even though `c` keeps increasing. Readers must break the trace at a note they do not
understand.

### Chunk boundaries

The stream is continuous across chunks: chunk 3 begins with the next line after the last
line of chunk 2, nothing is repeated or padded. A chunk ends when a lap is completed, when
its uncompressed text reaches **2 MB** (about two minutes at 20 Hz), or when the recording
stops. A gap in `c` is a real gap in the recording, often a pause.

## `summary.json`

Written last, only on a clean stop.

| Field | Meaning |
|-------|---------|
| `status` | `"closed"` |
| `sessionId` | matches the manifest; this is how a summary is paired with its file |
| `endedUtc` | when the stop happened |
| `reason` | `user`, `target-lost`, `no-timestamp`, `timestamp-reset`, `write-failed`, `stopped`, `sample`; a failed final chunk appends `+write-failed` |
| `frames`, `laps`, `chunks` | what is actually in the file. `laps` counts `lap` events |
| `bytes` | an estimate from the text written, not the compressed size |
| `durationS` | recorder clock at stop |
| `coverage` | per-channel `present`/`total` |
| `log` | how often each of the app's own log keys fired during this recording |

`coverage` is the answer to "what did this build actually report". For `scope: "frame"`,
`total` is the number of frames and `present` the frames where the value was not `null`.
For `scope: "wheel"`, `total` is four times the frames and `present` counts non-`null`
values across all four wheels, so `w.tyreWear` at `160/160` means every wheel answered on
every frame and `159/160` means one reading was missing somewhere (`docs/adr/0006`).

## `track.json`

1000 points by default, sampled once per recording through normalised progress:

```json
{"schema":1,
 "track":{"id":"ks_barcelona","layout":null,"name":"Circuit de Barcelona-Catalunya",
          "lengthM":4655,"closed":true,"source":"trackProgressToWorldCoordinate"},
 "points":[{"x":100,"z":0},{"x":99.99802,"z":0.377366}]}
```

World metres, unrotated and unfitted: turning the outline into a shape on a panel is the
reader's decision. `closed` tracks repeat their first point as the last one. If the build
has no spline accessor at all, **or has one that answers the same point for every
progress**, the entry is absent and `manifest.track.spline` is `false`; the frames are
still worth recording, and a reader can borrow an outline from another session of the same
track. The second case is not hypothetical: a mod track with `lengthM` 0 answered
`(-1, -1)` at every progress without raising an error, so the check is on the sampled
result — a thousand identical points are not a circuit.

## `dump_car.json`

Not part of the stream and not required. A snapshot of every field the app could reach on
the car object, including the physics-only fields it deliberately does not record, with
`null` for the ones the build did not expose. Its purpose is evidence: it is how a channel
that never arrives is traced to the game rather than to the recorder.

## Recordings from other sources

The envelope is not tied to this recorder. A future `.acreplay` importer can write the
same manifest, track and frame stream, with `provenance` saying `replay` instead of
`netcode` and with the channels the replay does not contain as `null`. That is the point of
`manifest.channels`: a reader learns what is in the file from the file, not from the app
version that wrote it. Nothing in the format assumes the frames were sampled live.

## Version policy

- `schema` (currently `1`) moves only when a field changes meaning or disappears.
- Adding a channel, an event field or a manifest key is backward compatible: readers look
  up by name, and `manifest.channels` tells them what this file contains.
- `app.version` moves on every release, including those that only add channels.
- `t` and `c` semantics are frozen: changing what `t` means invalidates every
  comparison ever made.

## What the validator enforces

Beyond the schema, `tools/apex_trace.py validate` checks the archive's own arithmetic:

- `manifest.json` is the first entry and `summary.json`, when present, the last;
- chunks are numbered `0001`, `0002`, … with no gaps;
- every frame carries exactly the declared frame keys, and every wheel exactly the
  declared wheel keys;
- `t` strictly increases and `c` does not go backwards;
- a `lap` event's `n` matches the `lapCount` of the frame before it;
- coverage `present`/`total` matches what the frames actually contain;
- `summary.frames`, `.chunks` and `.laps` match the file;
- a `closed` track's first and last points are the same.
