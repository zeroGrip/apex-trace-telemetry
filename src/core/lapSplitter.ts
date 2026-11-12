import {
  ApexFrameLine,
  ApexLapLine,
  ApexNoteLine,
  ApexSectorLine,
  ParsedApexArchive,
} from './parser';

export interface AnnotatedFrame {
  frame: ApexFrameLine;
  /**
   * Increments whenever a {"k": "note", "m": "reset"} (or any unknown note / resetCounter jump)
   * occurs. Used to break trajectory polylines and prevent interpolating across teleports.
   */
  segmentId: number;
}

export interface LapChannelAvailability {
  gas: boolean;
  brake: boolean;
  clutch: boolean;
  steer: boolean;
  handbrake: boolean;
  gear: boolean;
  rpm: boolean;
  speedKmh: boolean;
  position: boolean;
  trackCoordinates: boolean;
  oilTemperature: boolean;
  exhaustTemperature: boolean;
  tyreTemps: boolean;
  tyrePressures: boolean;
  tyreWear: boolean;
  slipRatio: boolean;
  slipAngle: boolean;
  loadK: boolean;
  brakeTemperature: boolean;
}

export interface ParsedLap {
  lapNumber: number;
  label: string;
  frames: AnnotatedFrame[];
  lapEvent: ApexLapLine | null;
  sectorEvents: ApexSectorLine[];
  noteEvents: ApexNoteLine[];
  hasReset: boolean;
  resetCount: number;
  durationMs: number | null;
  isValid: boolean | null;
  cuts: number | null;
  isComplete: boolean;
  minProgress: number;
  maxProgress: number;
  coverageSpan: number;
  maxSpeedKmh: number | null;
  minSpeedKmh: number | null;
  availability: LapChannelAvailability;
}

/**
 * Formats milliseconds into M:SS.mmm (e.g., 1:43.820)
 */
export function formatLapTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms) || ms <= 0) {
    return '—:——.———';
  }
  const roundedMs = Math.round(ms);
  const minutes = Math.floor(roundedMs / 60000);
  const seconds = Math.floor((roundedMs % 60000) / 1000);
  const millis = roundedMs % 1000;
  if (minutes > 0) {
    return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
  }
  return `${seconds}.${String(millis).padStart(3, '0')}s`;
}

/**
 * Splits a ParsedApexArchive stream into discrete laps, tracking `note` events
 * (such as `{"k": "note", "m": "reset"}`) and `resetCounter` changes to break
 * trajectory segments. Strictly preserves `null` (null is not zero).
 */
export function splitArchiveIntoLaps(archive: ParsedApexArchive): ParsedLap[] {
  const buckets = new Map<
    number,
    {
      frames: AnnotatedFrame[];
      lapEvent: ApexLapLine | null;
      sectorEvents: ApexSectorLine[];
      noteEvents: ApexNoteLine[];
    }
  >();

  const ensureBucket = (lapNum: number) => {
    let b = buckets.get(lapNum);
    if (!b) {
      b = {
        frames: [],
        lapEvent: null,
        sectorEvents: [],
        noteEvents: [],
      };
      buckets.set(lapNum, b);
    }
    return b;
  };

  let currentLapNum = 0;
  let currentSegmentId = 0;
  let lastResetCounter: number | null = null;
  let prevFrameLapNum: number | null = null;

  for (const line of archive.lines) {
    if (line.k === 'frame') {
      const lapNum =
        typeof line.lap === 'number'
          ? line.lap
          : typeof line.f?.lapCount === 'number'
          ? line.f.lapCount
          : currentLapNum;

      if (prevFrameLapNum !== null && lapNum !== prevFrameLapNum) {
        // New lap started
        currentSegmentId++;
      }
      currentLapNum = lapNum;
      prevFrameLapNum = lapNum;

      // Also check if resetCounter incremented inside frame channels
      const rc = line.f?.resetCounter;
      if (typeof rc === 'number') {
        if (lastResetCounter !== null && rc > lastResetCounter) {
          currentSegmentId++;
        }
        lastResetCounter = rc;
      }

      const bucket = ensureBucket(currentLapNum);
      bucket.frames.push({
        frame: line,
        segmentId: currentSegmentId,
      });
    } else if (line.k === 'note') {
      // Per schema.md:
      // "reset means the car was teleported... the frames before and after are not a continuous line.
      // Readers must break the trace at a note they do not understand."
      currentSegmentId++;
      const bucket = ensureBucket(currentLapNum);
      bucket.noteEvents.push(line);
    } else if (line.k === 'sector') {
      const bucket = ensureBucket(currentLapNum);
      bucket.sectorEvents.push(line);
    } else if (line.k === 'lap') {
      // Per schema.md:
      // "Written after the frame in which lapCount changed... n is the new lapCount (the lap that just started).
      // timeMs is previousLapTimeMs, the lap that just ended."
      const endedLapCandidate = line.n - 1;
      if (buckets.has(endedLapCandidate) && !buckets.get(endedLapCandidate)!.lapEvent) {
        buckets.get(endedLapCandidate)!.lapEvent = line;
      } else {
        const bucket = ensureBucket(currentLapNum);
        bucket.lapEvent = line;
      }
    }
  }

  const sortedLapNums = Array.from(buckets.keys()).sort((a, b) => a - b);
  const parsedLaps: ParsedLap[] = [];

  for (const lapNum of sortedLapNums) {
    const b = buckets.get(lapNum)!;
    if (b.frames.length === 0) continue;

    let minProg = Infinity;
    let maxProg = -Infinity;
    let maxSpeed: number | null = null;
    let minSpeed: number | null = null;

    const availability: LapChannelAvailability = {
      gas: false,
      brake: false,
      clutch: false,
      steer: false,
      handbrake: false,
      gear: false,
      rpm: false,
      speedKmh: false,
      position: false,
      trackCoordinates: false,
      oilTemperature: false,
      exhaustTemperature: false,
      tyreTemps: false,
      tyrePressures: false,
      tyreWear: false,
      slipRatio: false,
      slipAngle: false,
      loadK: false,
      brakeTemperature: false,
    };

    const uniqueSegments = new Set<number>();

    for (const af of b.frames) {
      uniqueSegments.add(af.segmentId);
      const f = af.frame.f;
      const w = af.frame.w;

      const prog =
        typeof f.splinePosition === 'number'
          ? f.splinePosition
          : Array.isArray(f.trackCoordinates) && typeof f.trackCoordinates[2] === 'number'
          ? f.trackCoordinates[2]
          : null;

      if (prog !== null) {
        if (prog < minProg) minProg = prog;
        if (prog > maxProg) maxProg = prog;
      }

      if (typeof f.speedKmh === 'number') {
        availability.speedKmh = true;
        if (maxSpeed === null || f.speedKmh > maxSpeed) maxSpeed = f.speedKmh;
        if (minSpeed === null || f.speedKmh < minSpeed) minSpeed = f.speedKmh;
      }

      if (typeof f.gas === 'number') availability.gas = true;
      if (typeof f.brake === 'number') availability.brake = true;
      if (typeof f.clutch === 'number') availability.clutch = true;
      if (typeof f.steer === 'number') availability.steer = true;
      if (typeof f.handbrake === 'number') availability.handbrake = true;
      if (typeof f.gear === 'number') availability.gear = true;
      if (typeof f.rpm === 'number') availability.rpm = true;
      if (Array.isArray(f.position)) availability.position = true;
      if (Array.isArray(f.trackCoordinates)) availability.trackCoordinates = true;
      if (typeof f.oilTemperature === 'number') availability.oilTemperature = true;
      if (typeof f.exhaustTemperature === 'number') availability.exhaustTemperature = true;

      if (Array.isArray(w) && w.length === 4) {
        for (let c = 0; c < 4; c++) {
          const wc = w[c];
          if (!wc) continue;
          if (typeof wc.tyreCoreTemperature === 'number' || typeof wc.tyreMiddleTemperature === 'number') {
            availability.tyreTemps = true;
          }
          if (typeof wc.tyrePressure === 'number') availability.tyrePressures = true;
          if (typeof wc.tyreWear === 'number') availability.tyreWear = true;
          if (typeof wc.slipRatio === 'number') availability.slipRatio = true;
          if (typeof wc.slipAngle === 'number') availability.slipAngle = true;
          if (typeof wc.loadK === 'number') availability.loadK = true;
          if (typeof wc.brakeTemperature === 'number') availability.brakeTemperature = true;
        }
      }
    }

    if (!Number.isFinite(minProg)) minProg = 0;
    if (!Number.isFinite(maxProg)) maxProg = 0;
    const coverageSpan = Math.max(0, maxProg - minProg);

    const firstFrame = b.frames[0].frame;
    const lastFrame = b.frames[b.frames.length - 1].frame;
    const elapsedPacketMs = lastFrame.t - firstFrame.t;

    // Determine lap duration: prefer official lapEvent.timeMs if reasonable, otherwise elapsed packet time
    let durationMs: number | null = null;
    if (b.lapEvent && typeof b.lapEvent.timeMs === 'number' && b.lapEvent.timeMs > 0) {
      durationMs = b.lapEvent.timeMs;
    } else if (elapsedPacketMs > 0) {
      durationMs = elapsedPacketMs;
    }

    const resetNotesCount = b.noteEvents.filter((n) => n.m === 'reset').length;
    const segmentBreaks = Math.max(0, uniqueSegments.size - 1);
    const resetCount = Math.max(resetNotesCount, segmentBreaks);
    const hasReset = resetCount > 0;

    const isComplete =
      (b.lapEvent !== null || coverageSpan >= 0.85) && !hasReset && b.frames.length >= 10;

    const isValid = b.lapEvent ? b.lapEvent.valid ?? null : null;
    const cuts = b.lapEvent ? b.lapEvent.cuts ?? null : null;

    const timeStr = formatLapTime(durationMs);
    const statusSuffix = hasReset
      ? ' [RESET]'
      : isValid === false
      ? ` [CUTS: ${cuts ?? '?'}]`
      : !isComplete && b.frames.length < 100
      ? ' [ЧАСТИЧНЫЙ]'
      : '';

    parsedLaps.push({
      lapNumber: lapNum,
      label: `Круг ${lapNum} — ${timeStr}${statusSuffix}`,
      frames: b.frames,
      lapEvent: b.lapEvent,
      sectorEvents: b.sectorEvents,
      noteEvents: b.noteEvents,
      hasReset,
      resetCount,
      durationMs,
      isValid,
      cuts,
      isComplete,
      minProgress: minProg,
      maxProgress: maxProg,
      coverageSpan,
      maxSpeedKmh: maxSpeed,
      minSpeedKmh: minSpeed,
      availability,
    });
  }

  return parsedLaps;
}

/**
 * Picks the best default lap in a session (prefers complete, valid, fastest lap;
 * falls back to the lap with the highest frame count).
 */
export function selectBestDefaultLap(laps: ParsedLap[]): number {
  if (laps.length === 0) return 0;

  const completeValid = laps.filter(
    (l) => l.isComplete && !l.hasReset && l.isValid !== false && l.durationMs !== null
  );
  if (completeValid.length > 0) {
    completeValid.sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity));
    return completeValid[0].lapNumber;
  }

  const completeAny = laps.filter((l) => l.isComplete && l.durationMs !== null);
  if (completeAny.length > 0) {
    completeAny.sort((a, b) => (a.durationMs ?? Infinity) - (b.durationMs ?? Infinity));
    return completeAny[0].lapNumber;
  }

  // Fallback to lap with most frames
  const byFrames = [...laps].sort((a, b) => b.frames.length - a.frames.length);
  return byFrames[0].lapNumber;
}
