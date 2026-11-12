import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate';

/**
 * Normative types strictly matching schema/apex-trace.schema.json (schema 1)
 */

export type Vec3OrNull = [number, number, number] | null;

export interface ApexManifest {
  schema: 1;
  app: 'apex-trace';
  version: string;
  status: 'open';
  sessionId: string;
  startedUtc: string;
  startedUnix?: number;
  target: {
    driverName: string;
    sessionID?: number | null;
    carModel?: string | null;
    carSkin?: string | null;
    isRemote?: boolean;
    isAi?: boolean;
  };
  track: {
    id?: string | null;
    layout?: string | null;
    name?: string | null;
    lengthM?: number | null;
    closed?: boolean;
    spline?: boolean;
    splineSource?: string;
  };
  server?: {
    name?: string;
    ip?: string;
    httpPort?: number | null;
  };
  sim?: {
    online?: boolean;
    sessionType?: number | null;
    ambientC?: number | null;
    roadC?: number | null;
    grip?: number | null;
  };
  channels: {
    frame: string[];
    wheels: string[];
  };
  provenance?: {
    wheels?: string;
    note?: string;
  };
}

export interface ApexCoverageEntry {
  id: string;
  scope: 'frame' | 'wheel';
  present: number;
  total: number;
}

export interface ApexSummary {
  schema: 1;
  app?: 'apex-trace';
  version?: string;
  status: 'closed';
  sessionId: string;
  endedUtc?: string;
  reason: string;
  frames: number;
  laps: number;
  chunks: number;
  bytes?: number;
  durationS?: number;
  coverage: ApexCoverageEntry[];
  log?: Record<string, number>;
}

export interface ApexTrackPoint {
  x: number;
  z: number;
}

export interface ApexTrack {
  schema: 1;
  track: {
    id?: string | null;
    layout?: string | null;
    name?: string | null;
    lengthM?: number | null;
    closed?: boolean;
    source?: string;
  };
  points: ApexTrackPoint[];
}

export interface ApexDump {
  schema: 1;
  app: 'apex-trace';
  version: string;
  track?: Record<string, unknown>;
  target?: Record<string, unknown>;
  fields: Record<string, unknown>;
  wheels?: unknown[];
}

export interface ApexFrameChannels {
  position: Vec3OrNull;
  velocity: Vec3OrNull;
  speedKmh: number | null;
  splinePosition: number | null;
  trackCoordinates: Vec3OrNull;
  yaw: number | null;
  pitch: number | null;
  roll: number | null;
  gas: number | null;
  brake: number | null;
  clutch: number | null;
  steer: number | null;
  handbrake: number | null;
  gear: number | null;
  engagedGear: number | null;
  rpm: number | null;
  lapTimeMs: number | null;
  bestLapTimeMs: number | null;
  previousLapTimeMs: number | null;
  lapCount: number | null;
  sessionLapCount: number | null;
  currentSector: number | null;
  previousSectorTime: number | null;
  racePosition: number | null;
  currentSplits: number[] | null;
  lastSplits: number[] | null;
  bestSplits: number[] | null;
  bestLapSplits: number[] | null;
  fuel: number | null;
  wheelsOutside: number | null;
  resetCounter: number | null;
  isInPit: boolean | null;
  isInPitlane: boolean | null;
  isRequestingPitStop: boolean | null;
  isConnected: boolean | null;
  isActive: boolean | null;
  isRemote: boolean | null;
  tyresName: string | null;
  oilTemperature: number | null;
  exhaustTemperature: number | null;
  [key: string]: unknown;
}

export interface ApexWheelChannels {
  tyreInsideTemperature: number | null;
  tyreMiddleTemperature: number | null;
  tyreOutsideTemperature: number | null;
  tyreCoreTemperature: number | null;
  tyrePressure: number | null;
  tyreWear: number | null;
  tyreGrain: number | null;
  tyreBlister: number | null;
  tyreFlatSpot: number | null;
  tyreVirtualKM: number | null;
  slipRatio: number | null;
  slipAngle: number | null;
  ndSlip: number | null;
  angularSpeed: number | null;
  loadK: number | null;
  camber: number | null;
  toeIn: number | null;
  suspensionTravel: number | null;
  brakeTemperature: number | null;
  discTemperature: number | null;
  surfaceValidTrack: boolean | null;
  surfacePitlane: boolean | null;
  [key: string]: unknown;
}

export interface ApexFrameLine {
  k: 'frame';
  t: number;
  c: number;
  lap: number | null;
  f: ApexFrameChannels;
  w: [ApexWheelChannels, ApexWheelChannels, ApexWheelChannels, ApexWheelChannels];
}

export interface ApexLapLine {
  k: 'lap';
  c: number;
  t?: number;
  n: number;
  timeMs?: number | null;
  bestMs?: number | null;
  valid?: boolean | null;
  cuts?: number | null;
}

export interface ApexSectorLine {
  k: 'sector';
  c: number;
  t?: number;
  n: number;
  timeMs?: number | null;
}

export interface ApexNoteLine {
  k: 'note';
  c: number;
  t?: number;
  m: string;
}

export type ApexStreamLine = ApexFrameLine | ApexLapLine | ApexSectorLine | ApexNoteLine;

export interface ParsedApexArchive {
  fileName: string;
  manifest: ApexManifest;
  track: ApexTrack | null;
  summary: ApexSummary | null;
  hasCleanSummary: boolean;
  computedCoverage: ApexCoverageEntry[];
  dumpCar: ApexDump | null;
  lines: ApexStreamLine[];
  frames: ApexFrameLine[];
  lapEvents: ApexLapLine[];
  sectorEvents: ApexSectorLine[];
  noteEvents: ApexNoteLine[];
  chunkNames: string[];
  warnings: string[];
}

const CHUNK_REGEX = /(?:^|\/)frames\/(\d{4})\.ndjson$/;

/**
 * Checks if a track spline has at least 2 distinct points (per schema.md:
 * "a thousand identical points are not a circuit").
 */
function isValidTrackSpline(track: ApexTrack | null): boolean {
  if (!track || !Array.isArray(track.points) || track.points.length < 2) {
    return false;
  }
  const first = track.points[0];
  for (let i = 1; i < track.points.length; i++) {
    const pt = track.points[i];
    if (Math.abs(pt.x - first.x) > 1e-4 || Math.abs(pt.z - first.z) > 1e-4) {
      return true;
    }
  }
  return false;
}

/**
 * Computes coverage directly from frame lines (used when summary.json is absent
 * or to verify actual frame channel presence). Strictly obeys null-is-not-zero.
 */
export function computeArchiveCoverage(
  manifest: ApexManifest,
  frames: ApexFrameLine[]
): ApexCoverageEntry[] {
  const frameChannels = manifest.channels?.frame ?? [];
  const wheelChannels = manifest.channels?.wheels ?? [];
  const totalFrames = frames.length;
  const totalWheels = totalFrames * 4;

  const framePresent: Record<string, number> = {};
  const wheelPresent: Record<string, number> = {};

  for (const ch of frameChannels) framePresent[ch] = 0;
  for (const ch of wheelChannels) wheelPresent[ch] = 0;

  for (let i = 0; i < frames.length; i++) {
    const fr = frames[i];
    if (fr.f) {
      for (const ch of frameChannels) {
        if (fr.f[ch] !== null && fr.f[ch] !== undefined) {
          framePresent[ch]++;
        }
      }
    }
    if (Array.isArray(fr.w)) {
      for (let corner = 0; corner < 4; corner++) {
        const wObj = fr.w[corner];
        if (!wObj) continue;
        for (const ch of wheelChannels) {
          if (wObj[ch] !== null && wObj[ch] !== undefined) {
            wheelPresent[ch]++;
          }
        }
      }
    }
  }

  const coverage: ApexCoverageEntry[] = [];
  for (const ch of frameChannels) {
    coverage.push({
      id: ch,
      scope: 'frame',
      present: framePresent[ch],
      total: totalFrames,
    });
  }
  for (const ch of wheelChannels) {
    coverage.push({
      id: `w.${ch}`,
      scope: 'wheel',
      present: wheelPresent[ch],
      total: totalWheels,
    });
  }

  return coverage;
}

/**
 * Parses an unpacked map of file strings into a ParsedApexArchive.
 */
export function parseApexEntries(
  fileName: string,
  textEntries: Record<string, string>
): ParsedApexArchive {
  const warnings: string[] = [];

  // Locate manifest.json (supporting root or single nested directory)
  const entryKeys = Object.keys(textEntries);
  const manifestKey = entryKeys.find(
    (k) => k === 'manifest.json' || k.endsWith('/manifest.json')
  );
  if (!manifestKey) {
    throw new Error(`В архиве "${fileName}" отсутствует обязательный файл manifest.json`);
  }

  const prefix = manifestKey.slice(0, manifestKey.length - 'manifest.json'.length);
  const manifest = JSON.parse(textEntries[manifestKey]) as ApexManifest;

  // Read optional track.json if manifest.track.spline !== false
  let track: ApexTrack | null = null;
  const trackKey = entryKeys.find((k) => k === `${prefix}track.json`);
  if (manifest.track?.spline === false) {
    warnings.push('manifest.track.spline === false: сплайн трассы отсутствует в архиве.');
  } else if (trackKey) {
    try {
      const parsedTrack = JSON.parse(textEntries[trackKey]) as ApexTrack;
      if (isValidTrackSpline(parsedTrack)) {
        track = parsedTrack;
      } else {
        warnings.push('track.json содержит вырожденные точки (все точки совпадают) и был проигнорирован.');
      }
    } catch (e) {
      warnings.push(`Не удалось прочитать track.json: ${(e as Error).message}`);
    }
  } else {
    warnings.push('Файл track.json отсутствует в архиве.');
  }

  // Find and sort frames/NNNN.ndjson chunks sequentially (0001, 0002...)
  const chunkMatches: { key: string; index: number; shortName: string }[] = [];
  for (const k of entryKeys) {
    if (!k.startsWith(prefix)) continue;
    const rel = k.slice(prefix.length);
    const m = rel.match(CHUNK_REGEX);
    if (m) {
      chunkMatches.push({
        key: k,
        index: parseInt(m[1], 10),
        shortName: rel,
      });
    }
  }

  chunkMatches.sort((a, b) => a.index - b.index);

  if (chunkMatches.length === 0) {
    throw new Error(`В архиве "${fileName}" не найдено ни одного чанка frames/NNNN.ndjson`);
  }

  if (chunkMatches[0].index !== 1) {
    warnings.push(
      `Чанки начинаются с ${ String(chunkMatches[0].index).padStart(4, '0') }, ожидался 0001.`
    );
  }
  for (let i = 1; i < chunkMatches.length; i++) {
    if (chunkMatches[i].index !== chunkMatches[i - 1].index + 1) {
      warnings.push(
        `Пропуск в нумерации чанков: ${String(chunkMatches[i - 1].index).padStart(4, '0')} -> ${String(chunkMatches[i].index).padStart(4, '0')}`
      );
    }
  }

  const lines: ApexStreamLine[] = [];
  const frames: ApexFrameLine[] = [];
  const lapEvents: ApexLapLine[] = [];
  const sectorEvents: ApexSectorLine[] = [];
  const noteEvents: ApexNoteLine[] = [];

  for (const chunk of chunkMatches) {
    const rawText = textEntries[chunk.key];
    const rawLines = rawText.split('\n');
    for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
      const trimmed = rawLines[lineIdx].trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as ApexStreamLine;
        if (!parsed || typeof parsed !== 'object' || !('k' in parsed)) continue;
        lines.push(parsed);
        if (parsed.k === 'frame') {
          frames.push(parsed);
        } else if (parsed.k === 'lap') {
          lapEvents.push(parsed);
        } else if (parsed.k === 'sector') {
          sectorEvents.push(parsed);
        } else if (parsed.k === 'note') {
          noteEvents.push(parsed);
        }
      } catch {
        warnings.push(`Поврежденная строка JSON в ${chunk.shortName}:${lineIdx + 1} (пропущена)`);
      }
    }
  }

  // Read optional summary.json
  let summary: ApexSummary | null = null;
  const summaryKey = entryKeys.find((k) => k === `${prefix}summary.json`);
  if (summaryKey) {
    try {
      summary = JSON.parse(textEntries[summaryKey]) as ApexSummary;
    } catch (e) {
      warnings.push(`Ошибка чтения summary.json: ${(e as Error).message}`);
    }
  } else {
    warnings.push(
      'summary.json отсутствует (запись была прервана нештатно). Покрытие каналов вычислено автоматически по фреймам.'
    );
  }

  // Read optional dump_car.json
  let dumpCar: ApexDump | null = null;
  const dumpKey = entryKeys.find((k) => k === `${prefix}dump_car.json`);
  if (dumpKey) {
    try {
      dumpCar = JSON.parse(textEntries[dumpKey]) as ApexDump;
    } catch {
      // Ignore dump_car parse errors
    }
  }

  const computedCoverage = summary?.coverage?.length
    ? summary.coverage
    : computeArchiveCoverage(manifest, frames);

  return {
    fileName,
    manifest,
    track,
    summary,
    hasCleanSummary: summary !== null,
    computedCoverage,
    dumpCar,
    lines,
    frames,
    lapEvents,
    sectorEvents,
    noteEvents,
    chunkNames: chunkMatches.map((c) => c.shortName),
    warnings,
  };
}

/**
 * Unpacks a binary .apex.zip buffer using fflate on the client.
 */
export async function parseApexZipBuffer(
  fileName: string,
  buffer: ArrayBuffer
): Promise<ParsedApexArchive> {
  const uint8 = new Uint8Array(buffer);
  const unzipped = unzipSync(uint8);
  const textEntries: Record<string, string> = {};

  for (const [entryPath, bytes] of Object.entries(unzipped)) {
    // Skip directory entries
    if (entryPath.endsWith('/')) continue;
    textEntries[entryPath] = strFromU8(bytes);
  }

  return parseApexEntries(fileName, textEntries);
}

/**
 * Packs a ParsedApexArchive back into a valid .apex.zip Uint8Array using fflate
 * in the exact entry order required by schema.md:
 * 1. manifest.json
 * 2. track.json (if present)
 * 3.. frames/NNNN.ndjson
 * .. dump_car.json (if present)
 * last. summary.json (if present)
 */
export function packApexArchiveToZip(archive: ParsedApexArchive): Uint8Array {
  const files: Record<string, Uint8Array> = {};

  files['manifest.json'] = strToU8(JSON.stringify(archive.manifest, null, 2) + '\n');

  if (archive.track) {
    files['track.json'] = strToU8(JSON.stringify(archive.track) + '\n');
  }

  // Write lines into chunks (split on lap events or every 2500 lines)
  let chunkIndex = 1;
  let currentLines: string[] = [];

  const flushChunk = () => {
    if (currentLines.length === 0) return;
    const chunkName = `frames/${String(chunkIndex).padStart(4, '0')}.ndjson`;
    files[chunkName] = strToU8(currentLines.join('\n') + '\n');
    chunkIndex++;
    currentLines = [];
  };

  for (const line of archive.lines) {
    currentLines.push(JSON.stringify(line));
    if (line.k === 'lap' || currentLines.length >= 2500) {
      flushChunk();
    }
  }
  flushChunk();

  if (archive.dumpCar) {
    files['dump_car.json'] = strToU8(JSON.stringify(archive.dumpCar, null, 2) + '\n');
  }

  if (archive.summary) {
    files['summary.json'] = strToU8(JSON.stringify(archive.summary, null, 2) + '\n');
  }

  return zipSync(files, { level: 6 });
}
