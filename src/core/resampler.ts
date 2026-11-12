import { AnnotatedFrame, ParsedLap } from './lapSplitter';

export interface ResampledWheelSample {
  tyreCoreTemperature: number | null;
  tyreInsideTemperature: number | null;
  tyreMiddleTemperature: number | null;
  tyreOutsideTemperature: number | null;
  tyrePressure: number | null;
  tyreWear: number | null;
  slipRatio: number | null;
  slipAngle: number | null;
  ndSlip: number | null;
  loadK: number | null;
  brakeTemperature: number | null;
}

export interface ResampledMeterPoint {
  /** Distance from start/finish line in meters (step = 1m) */
  distanceM: number;
  /** Normalized spline progress 0..1 */
  progress: number;
  /** Elapsed time since lap start in seconds (\tau = t - t_lapStart) */
  elapsedTimeS: number | null;
  /** World X coordinate (meters) */
  x: number | null;
  /** World Z coordinate (meters) */
  z: number | null;
  /** Normalized lateral track position (-1 = left edge, 0 = center, +1 = right edge) */
  lateral: number | null;
  /** Speed in km/h */
  speedKmh: number | null;
  /** Throttle input 0..1 */
  gas: number | null;
  /** Brake input 0..1 */
  brake: number | null;
  /** Clutch input 0..1 */
  clutch: number | null;
  /** Steering angle in degrees */
  steer: number | null;
  /** Gear (-1 = R, 0 = N, 1..8) — sampled step-wise, never fractional */
  gear: number | null;
  /** Engine RPM */
  rpm: number | null;
  /** Yaw in degrees */
  yaw: number | null;
  /** Pitch in degrees */
  pitch: number | null;
  /** Roll in degrees */
  roll: number | null;
  /** Current sector index */
  sector: number | null;
  /** Number of wheels outside track */
  wheelsOutside: number | null;
  /** Oil temperature C */
  oilTemperature: number | null;
  /** Exhaust temperature C */
  exhaustTemperature: number | null;
  /** 4 wheels [FL, FR, RL, RR] */
  wheels: [
    ResampledWheelSample,
    ResampledWheelSample,
    ResampledWheelSample,
    ResampledWheelSample
  ] | null;
  /** Segment ID from note="reset" splitting */
  segmentId: number | null;
  /** True if this meter falls inside a reset/teleport discontinuity */
  isResetGap: boolean;
}

export interface ResampledLapGrid {
  lapNumber: number;
  trackLengthM: number;
  points: ResampledMeterPoint[];
  validDistanceRange: [number, number];
}

export interface ComparisonPoint {
  distanceM: number;
  progress: number;
  /** \Delta T(d) = \tau_user(d) - \tau_ref(d) in seconds (positive = user is slower/behind) */
  deltaTimeS: number | null;
  /** Speed difference: V_user(d) - V_ref(d) in km/h */
  deltaSpeedKmh: number | null;
  ref: ResampledMeterPoint | null;
  user: ResampledMeterPoint | null;
}

/**
 * Strictly obeys "null is not zero":
 * If either endpoint is null or undefined, returns null.
 */
function lerpNullSafe(a: number | null | undefined, b: number | null | undefined, alpha: number): number | null {
  if (a === null || a === undefined || b === null || b === undefined) {
    return null;
  }
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return a + (b - a) * alpha;
}

/**
 * Step-wise interpolation for discrete channels like gear and sector.
 * Never produces fractional gears.
 */
function stepNullSafe(a: number | null | undefined, b: number | null | undefined, alpha: number): number | null {
  const chosen = alpha < 0.85 ? a : b;
  if (chosen === null || chosen === undefined || !Number.isFinite(chosen)) {
    return null;
  }
  return Math.round(chosen);
}

interface FrameWithDistance {
  annotated: AnnotatedFrame;
  distanceM: number;
  elapsedS: number;
}

/**
 * Assigns monotonically increasing (within each continuous segment) track distance in meters
 * to every frame in the lap.
 */
function mapFramesToDistances(lap: ParsedLap, trackLengthM: number): FrameWithDistance[] {
  if (lap.frames.length === 0) return [];

  const firstT = lap.frames[0].frame.t;
  const rawProgresses: (number | null)[] = lap.frames.map((af) => {
    const f = af.frame.f;
    if (typeof f.splinePosition === 'number' && Number.isFinite(f.splinePosition)) {
      return f.splinePosition;
    }
    if (
      Array.isArray(f.trackCoordinates) &&
      typeof f.trackCoordinates[2] === 'number' &&
      Number.isFinite(f.trackCoordinates[2])
    ) {
      return f.trackCoordinates[2];
    }
    return null;
  });

  // Check if splinePosition actually changes across the frames
  let minP = Infinity;
  let maxP = -Infinity;
  for (const p of rawProgresses) {
    if (p !== null) {
      if (p < minP) minP = p;
      if (p > maxP) maxP = p;
    }
  }

  const hasChangingSpline = Number.isFinite(minP) && Number.isFinite(maxP) && maxP - minP > 1e-4;

  const result: FrameWithDistance[] = [];
  let integratedDist = Number.isFinite(minP) ? minP * trackLengthM : 0;

  for (let i = 0; i < lap.frames.length; i++) {
    const af = lap.frames[i];
    const f = af.frame.f;
    const elapsedS = Math.max(0, (af.frame.t - firstT) / 1000);

    let distM: number;
    if (hasChangingSpline && rawProgresses[i] !== null) {
      distM = rawProgresses[i]! * trackLengthM;
      // Handle start/finish wrap-around on the first 2 frames or last 2 frames of a lap
      if (i < 5 && distM > trackLengthM * 0.9 && minP < 0.1) {
        distM = 0;
      } else if (i > lap.frames.length - 5 && distM < trackLengthM * 0.05 && maxP > 0.9) {
        distM = trackLengthM;
      }
    } else {
      // Fallback when splinePosition is missing or static (e.g. synthetic test snippet):
      // Integrate Euclidean world distance or speed * dt
      if (i > 0) {
        const prevAf = lap.frames[i - 1];
        if (prevAf.segmentId === af.segmentId) {
          const prevPos = prevAf.frame.f.position;
          const curPos = f.position;
          let stepM = 0;
          if (Array.isArray(prevPos) && Array.isArray(curPos)) {
            const dx = curPos[0] - prevPos[0];
            const dz = curPos[2] - prevPos[2];
            stepM = Math.hypot(dx, dz);
          }
          if (stepM < 1e-3 && typeof f.speedKmh === 'number') {
            const dtS = Math.max(0, (af.frame.t - prevAf.frame.t) / 1000);
            stepM = (f.speedKmh / 3.6) * dtS;
          }
          integratedDist += stepM;
        }
      }
      distM = Math.min(trackLengthM, Math.max(0, integratedDist));
    }

    result.push({
      annotated: af,
      distanceM: distM,
      elapsedS,
    });
  }

  return result;
}

function createNullPoint(distanceM: number, trackLengthM: number, isResetGap = false): ResampledMeterPoint {
  return {
    distanceM,
    progress: trackLengthM > 0 ? distanceM / trackLengthM : 0,
    elapsedTimeS: null,
    x: null,
    z: null,
    lateral: null,
    speedKmh: null,
    gas: null,
    brake: null,
    clutch: null,
    steer: null,
    gear: null,
    rpm: null,
    yaw: null,
    pitch: null,
    roll: null,
    sector: null,
    wheelsOutside: null,
    oilTemperature: null,
    exhaustTemperature: null,
    wheels: null,
    segmentId: null,
    isResetGap,
  };
}

/**
 * Resamples a ParsedLap onto a uniform 1-meter grid from 0 to trackLengthM.
 *
 * Rules enforced:
 * 1. Step = 1 meter from 0 to trackLengthM.
 * 2. Linearly interpolates speedKmh, elapsedTimeS (\tau), gas, brake, clutch, steer, [x, z], etc.
 * 3. Gear is sampled step-wise (no fractional gears).
 * 4. "Null is not zero": any null channel remains null.
 * 5. Breaks trajectory / interpolation across {"k": "note", "m": "reset"} segment boundaries.
 */
export function resampleLapToMeterGrid(
  lap: ParsedLap,
  rawTrackLengthM: number | null | undefined
): ResampledLapGrid {
  const trackLengthM =
    typeof rawTrackLengthM === 'number' && rawTrackLengthM > 10
      ? Math.round(rawTrackLengthM)
      : 4655;

  const mapped = mapFramesToDistances(lap, trackLengthM);
  if (mapped.length === 0) {
    const emptyPoints: ResampledMeterPoint[] = [];
    for (let d = 0; d <= trackLengthM; d++) {
      emptyPoints.push(createNullPoint(d, trackLengthM, false));
    }
    return {
      lapNumber: lap.lapNumber,
      trackLengthM,
      points: emptyPoints,
      validDistanceRange: [0, 0],
    };
  }

  // Group into continuous segments separated by note="reset" or large backwards distance jumps
  interface ContinuousSegment {
    segmentId: number;
    samples: FrameWithDistance[];
    minD: number;
    maxD: number;
  }

  const segments: ContinuousSegment[] = [];
  let currentSeg: ContinuousSegment | null = null;

  for (let i = 0; i < mapped.length; i++) {
    const item = mapped[i];
    const segId = item.annotated.segmentId;

    if (!currentSeg || currentSeg.segmentId !== segId) {
      currentSeg = {
        segmentId: segId,
        samples: [item],
        minD: item.distanceM,
        maxD: item.distanceM,
      };
      segments.push(currentSeg);
    } else {
      const lastSample = currentSeg.samples[currentSeg.samples.length - 1];
      // Ignore slight jitter backwards, but if car jumped backwards > 40m without a note, split segment
      if (item.distanceM < lastSample.distanceM - 40) {
        currentSeg = {
          segmentId: segId * 1000 + i,
          samples: [item],
          minD: item.distanceM,
          maxD: item.distanceM,
        };
        segments.push(currentSeg);
      } else if (item.distanceM >= lastSample.distanceM) {
        currentSeg.samples.push(item);
        if (item.distanceM > currentSeg.maxD) currentSeg.maxD = item.distanceM;
      }
    }
  }

  let overallMinD = Infinity;
  let overallMaxD = -Infinity;
  for (const seg of segments) {
    if (seg.minD < overallMinD) overallMinD = seg.minD;
    if (seg.maxD > overallMaxD) overallMaxD = seg.maxD;
  }

  const points: ResampledMeterPoint[] = new Array(trackLengthM + 1);
  let segCursor = 0;

  for (let d = 0; d <= trackLengthM; d++) {
    // Advance segment cursor monotonically since segments are ordered in time/distance unless reset occurred
    let activeSeg: ContinuousSegment | null = null;
    if (
      segCursor < segments.length &&
      d >= segments[segCursor].minD - 1.5 &&
      d <= segments[segCursor].maxD + 1.5 &&
      segments[segCursor].samples.length >= 1
    ) {
      activeSeg = segments[segCursor];
    } else {
      for (let s = 0; s < segments.length; s++) {
        const seg = segments[s];
        if (d >= seg.minD - 1.5 && d <= seg.maxD + 1.5 && seg.samples.length >= 1) {
          activeSeg = seg;
          segCursor = s;
          break;
        }
      }
    }

    if (!activeSeg) {
      const isBetweenResetSegments =
        segments.length > 1 && d >= overallMinD && d <= overallMaxD;
      points[d] = createNullPoint(d, trackLengthM, isBetweenResetSegments);
      continue;
    }

    const samples = activeSeg.samples;
    // Binary search for bounding samples around distance d
    let lo = 0;
    let hi = samples.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (samples[mid].distanceM <= d) {
        lo = mid;
      } else {
        hi = mid;
      }
    }

    const left = samples[lo];
    const right = samples[hi];
    const span = right.distanceM - left.distanceM;

    // If span is huge (> 120m gap without frames), do not interpolate across missing chunk/teleport
    if (span > 120) {
      points[d] = createNullPoint(d, trackLengthM, true);
      continue;
    }

    const alpha = span > 1e-6 ? Math.max(0, Math.min(1, (d - left.distanceM) / span)) : 0;

    const fL = left.annotated.frame.f;
    const fR = right.annotated.frame.f;

    const posL = Array.isArray(fL.position) ? fL.position : null;
    const posR = Array.isArray(fR.position) ? fR.position : null;

    const tcL = Array.isArray(fL.trackCoordinates) ? fL.trackCoordinates : null;
    const tcR = Array.isArray(fR.trackCoordinates) ? fR.trackCoordinates : null;

    const wL = Array.isArray(left.annotated.frame.w) ? left.annotated.frame.w : null;
    const wR = Array.isArray(right.annotated.frame.w) ? right.annotated.frame.w : null;

    let resampledWheels: [
      ResampledWheelSample,
      ResampledWheelSample,
      ResampledWheelSample,
      ResampledWheelSample
    ] | null = null;

    if (wL && wR && wL.length === 4 && wR.length === 4) {
      const corners: ResampledWheelSample[] = [];
      for (let c = 0; c < 4; c++) {
        const cL = wL[c];
        const cR = wR[c];
        corners.push({
          tyreCoreTemperature: lerpNullSafe(cL?.tyreCoreTemperature, cR?.tyreCoreTemperature, alpha),
          tyreInsideTemperature: lerpNullSafe(cL?.tyreInsideTemperature, cR?.tyreInsideTemperature, alpha),
          tyreMiddleTemperature: lerpNullSafe(cL?.tyreMiddleTemperature, cR?.tyreMiddleTemperature, alpha),
          tyreOutsideTemperature: lerpNullSafe(cL?.tyreOutsideTemperature, cR?.tyreOutsideTemperature, alpha),
          tyrePressure: lerpNullSafe(cL?.tyrePressure, cR?.tyrePressure, alpha),
          tyreWear: lerpNullSafe(cL?.tyreWear, cR?.tyreWear, alpha),
          slipRatio: lerpNullSafe(cL?.slipRatio, cR?.slipRatio, alpha),
          slipAngle: lerpNullSafe(cL?.slipAngle, cR?.slipAngle, alpha),
          ndSlip: lerpNullSafe(cL?.ndSlip, cR?.ndSlip, alpha),
          loadK: lerpNullSafe(cL?.loadK, cR?.loadK, alpha),
          brakeTemperature: lerpNullSafe(cL?.brakeTemperature, cR?.brakeTemperature, alpha),
        });
      }
      resampledWheels = corners as [
        ResampledWheelSample,
        ResampledWheelSample,
        ResampledWheelSample,
        ResampledWheelSample
      ];
    }

    points[d] = {
      distanceM: d,
      progress: trackLengthM > 0 ? d / trackLengthM : 0,
      elapsedTimeS: lerpNullSafe(left.elapsedS, right.elapsedS, alpha),
      x: posL && posR ? lerpNullSafe(posL[0], posR[0], alpha) : null,
      z: posL && posR ? lerpNullSafe(posL[2], posR[2], alpha) : null,
      lateral: tcL && tcR ? lerpNullSafe(tcL[0], tcR[0], alpha) : null,
      speedKmh: lerpNullSafe(fL.speedKmh, fR.speedKmh, alpha),
      gas: lerpNullSafe(fL.gas, fR.gas, alpha),
      brake: lerpNullSafe(fL.brake, fR.brake, alpha),
      clutch: lerpNullSafe(fL.clutch, fR.clutch, alpha),
      steer: lerpNullSafe(fL.steer, fR.steer, alpha),
      gear: stepNullSafe(fL.gear, fR.gear, alpha),
      rpm: lerpNullSafe(fL.rpm, fR.rpm, alpha),
      yaw: lerpNullSafe(fL.yaw, fR.yaw, alpha),
      pitch: lerpNullSafe(fL.pitch, fR.pitch, alpha),
      roll: lerpNullSafe(fL.roll, fR.roll, alpha),
      sector: stepNullSafe(fL.currentSector, fR.currentSector, alpha),
      wheelsOutside: stepNullSafe(fL.wheelsOutside, fR.wheelsOutside, alpha),
      oilTemperature: lerpNullSafe(fL.oilTemperature, fR.oilTemperature, alpha),
      exhaustTemperature: lerpNullSafe(fL.exhaustTemperature, fR.exhaustTemperature, alpha),
      wheels: resampledWheels,
      segmentId: activeSeg.segmentId,
      isResetGap: false,
    };
  }

  return {
    lapNumber: lap.lapNumber,
    trackLengthM,
    points,
    validDistanceRange: [
      Number.isFinite(overallMinD) ? Math.max(0, Math.floor(overallMinD)) : 0,
      Number.isFinite(overallMaxD) ? Math.min(trackLengthM, Math.ceil(overallMaxD)) : 0,
    ],
  };
}

/**
 * Builds the unified 1-meter comparison array between Reference (Archive 1) and User (Archive 2).
 * Computes \Delta T(d) = \tau_user(d) - \tau_ref(d).
 */
export function buildLapComparisonGrid(
  refGrid: ResampledLapGrid | null,
  userGrid: ResampledLapGrid | null
): ComparisonPoint[] {
  const trackLengthM = Math.max(
    refGrid?.trackLengthM ?? 0,
    userGrid?.trackLengthM ?? 0,
    100
  );

  // Find first common valid meter so \Delta T starts anchored at 0.000s if partial lap
  let anchorOffsetS = 0;
  let foundAnchor = false;

  const comparison: ComparisonPoint[] = new Array(trackLengthM + 1);

  for (let d = 0; d <= trackLengthM; d++) {
    const refPt = refGrid && d < refGrid.points.length ? refGrid.points[d] : null;
    const userPt = userGrid && d < userGrid.points.length ? userGrid.points[d] : null;

    let deltaTimeS: number | null = null;
    if (
      refPt &&
      userPt &&
      refPt.elapsedTimeS !== null &&
      userPt.elapsedTimeS !== null &&
      !refPt.isResetGap &&
      !userPt.isResetGap
    ) {
      if (!foundAnchor) {
        foundAnchor = true;
        // If the lap starts near 0m, raw tau difference is already 0; if comparing a mid-lap snippet, zero-anchor at start
        if (d > 25) {
          anchorOffsetS = userPt.elapsedTimeS - refPt.elapsedTimeS;
        }
      }
      deltaTimeS = userPt.elapsedTimeS - refPt.elapsedTimeS - anchorOffsetS;
    }

    let deltaSpeedKmh: number | null = null;
    if (
      refPt &&
      userPt &&
      refPt.speedKmh !== null &&
      userPt.speedKmh !== null &&
      !refPt.isResetGap &&
      !userPt.isResetGap
    ) {
      deltaSpeedKmh = userPt.speedKmh - refPt.speedKmh;
    }

    comparison[d] = {
      distanceM: d,
      progress: d / trackLengthM,
      deltaTimeS,
      deltaSpeedKmh,
      ref: refPt,
      user: userPt,
    };
  }

  return comparison;
}
