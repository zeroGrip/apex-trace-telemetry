import { ComparisonPoint, ResampledLapGrid, ResampledMeterPoint } from './resampler';

export interface LapExtremum {
  kind: 'vmin' | 'vmax';
  /** Corner or straight number (1-indexed) */
  index: number;
  distanceM: number;
  progress: number;
  speedKmh: number;
  gear: number | null;
  x: number | null;
  z: number | null;
}

export interface PairedExtremumBadge {
  id: string;
  kind: 'vmin' | 'vmax';
  index: number;
  label: string;
  distanceM: number;
  progress: number;
  x: number;
  z: number;
  refSpeedKmh: number | null;
  userSpeedKmh: number | null;
  /** userSpeedKmh - refSpeedKmh (negative = user is slower at apex/straight) */
  speedDeltaKmh: number | null;
  refGear: number | null;
  userGear: number | null;
  /** Time lost (+) or gained (-) by User across the corner zone (from entry -80m to exit +80m) */
  cornerTimeLossS: number | null;
  /** Braking point distanceM for Reference */
  refBrakeDistanceM: number | null;
  /** Braking point distanceM for User */
  userBrakeDistanceM: number | null;
}

/**
 * Finds local speed extrema (V_min in corners and V_max before braking)
 * using a hysteresis threshold >= 12 km/h as specified in Section 3.3.
 */
export function detectLapExtrema(
  grid: ResampledLapGrid | null,
  hysteresisKmh = 12
): LapExtremum[] {
  if (!grid || grid.points.length === 0) return [];

  const validPts: ResampledMeterPoint[] = [];
  for (const pt of grid.points) {
    if (pt.speedKmh !== null && !pt.isResetGap) {
      validPts.push(pt);
    }
  }
  if (validPts.length < 15) return [];

  // Smooth speed slightly over a 7-meter window to suppress packet quantization noise
  const smoothedSpeed = new Float64Array(validPts.length);
  for (let i = 0; i < validPts.length; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -3; k <= 3; k++) {
      const idx = Math.max(0, Math.min(validPts.length - 1, i + k));
      sum += validPts[idx].speedKmh!;
      count++;
    }
    smoothedSpeed[i] = sum / count;
  }

  const rawExtrema: { kind: 'vmin' | 'vmax'; pt: ResampledMeterPoint; speed: number }[] = [];

  // State machine with hysteresis >= 12 km/h
  let mode: 'seeking_min' | 'seeking_max' | 'init' = 'init';
  let candidateMinIdx = 0;
  let candidateMaxIdx = 0;

  for (let i = 1; i < validPts.length; i++) {
    const v = smoothedSpeed[i];

    if (mode === 'init') {
      if (v < smoothedSpeed[candidateMinIdx]) candidateMinIdx = i;
      if (v > smoothedSpeed[candidateMaxIdx]) candidateMaxIdx = i;

      if (smoothedSpeed[candidateMaxIdx] - v >= hysteresisKmh) {
        rawExtrema.push({
          kind: 'vmax',
          pt: validPts[candidateMaxIdx],
          speed: validPts[candidateMaxIdx].speedKmh!,
        });
        candidateMinIdx = i;
        mode = 'seeking_min';
      } else if (v - smoothedSpeed[candidateMinIdx] >= hysteresisKmh) {
        rawExtrema.push({
          kind: 'vmin',
          pt: validPts[candidateMinIdx],
          speed: validPts[candidateMinIdx].speedKmh!,
        });
        candidateMaxIdx = i;
        mode = 'seeking_max';
      }
    } else if (mode === 'seeking_min') {
      if (v < smoothedSpeed[candidateMinIdx]) {
        candidateMinIdx = i;
      } else if (v - smoothedSpeed[candidateMinIdx] >= hysteresisKmh) {
        // Confirmed local minimum (corner apex speed V_min)
        rawExtrema.push({
          kind: 'vmin',
          pt: validPts[candidateMinIdx],
          speed: validPts[candidateMinIdx].speedKmh!,
        });
        candidateMaxIdx = i;
        mode = 'seeking_max';
      }
    } else if (mode === 'seeking_max') {
      if (v > smoothedSpeed[candidateMaxIdx]) {
        candidateMaxIdx = i;
      } else if (smoothedSpeed[candidateMaxIdx] - v >= hysteresisKmh) {
        // Confirmed local maximum (top speed before braking V_max)
        rawExtrema.push({
          kind: 'vmax',
          pt: validPts[candidateMaxIdx],
          speed: validPts[candidateMaxIdx].speedKmh!,
        });
        candidateMinIdx = i;
        mode = 'seeking_min';
      }
    }
  }

  // Merge extrema of the same kind that are closer than 85 meters
  const filtered: { kind: 'vmin' | 'vmax'; pt: ResampledMeterPoint; speed: number }[] = [];
  for (const ext of rawExtrema) {
    const prev = filtered[filtered.length - 1];
    if (prev && prev.kind === ext.kind && Math.abs(ext.pt.distanceM - prev.pt.distanceM) < 85) {
      if (
        (ext.kind === 'vmin' && ext.speed < prev.speed) ||
        (ext.kind === 'vmax' && ext.speed > prev.speed)
      ) {
        filtered[filtered.length - 1] = ext;
      }
    } else {
      filtered.push(ext);
    }
  }

  let minCounter = 1;
  let maxCounter = 1;

  return filtered.map((item) => {
    const index = item.kind === 'vmin' ? minCounter++ : maxCounter++;
    return {
      kind: item.kind,
      index,
      distanceM: item.pt.distanceM,
      progress: item.pt.progress,
      speedKmh: item.speed,
      gear: item.pt.gear,
      x: item.pt.x,
      z: item.pt.z,
    };
  });
}

/**
 * Finds the braking initiation distance (in meters) up to 220m before a corner apex
 * where brake input exceeds 0.15.
 */
function findBrakingPointBeforeApex(
  grid: ResampledLapGrid | null,
  apexDistanceM: number
): number | null {
  if (!grid) return null;
  const startSearch = Math.max(0, Math.round(apexDistanceM - 220));
  const endSearch = Math.min(grid.points.length - 1, Math.round(apexDistanceM));

  // Scan backwards from apex to find where braking zone started
  let inBrakingZone = false;
  let brakeStartM: number | null = null;

  for (let d = endSearch; d >= startSearch; d--) {
    const pt = grid.points[d];
    const brk = pt?.brake;
    if (brk !== null && brk !== undefined && brk >= 0.15) {
      inBrakingZone = true;
      brakeStartM = d;
    } else if (inBrakingZone && (brk === null || brk < 0.05)) {
      break;
    }
  }
  return brakeStartM;
}

/**
 * Pairs extrema from Reference (Archive 1) and User (Archive 2) laps to build
 * the 2D Map Badges and Corner Analysis Table rows.
 */
export function buildPairedExtremaBadges(
  refGrid: ResampledLapGrid | null,
  userGrid: ResampledLapGrid | null,
  comparison: ComparisonPoint[],
  hysteresisKmh = 12
): PairedExtremumBadge[] {
  const refExtrema = detectLapExtrema(refGrid, hysteresisKmh);
  const userExtrema = detectLapExtrema(userGrid, hysteresisKmh);

  const usedUserIndices = new Set<number>();
  const badges: PairedExtremumBadge[] = [];

  const primaryList = refExtrema.length > 0 ? refExtrema : userExtrema;
  const isRefPrimary = refExtrema.length > 0;

  let cornerNumber = 1;
  let straightNumber = 1;

  for (const primary of primaryList) {
    let matchedSecondary: LapExtremum | null = null;

    if (isRefPrimary && userExtrema.length > 0) {
      // Find closest User extremum of the same kind within +-95m
      let bestDistDiff = 95;
      let bestIdx = -1;
      for (let j = 0; j < userExtrema.length; j++) {
        if (usedUserIndices.has(j)) continue;
        const cand = userExtrema[j];
        if (cand.kind !== primary.kind) continue;
        const diff = Math.abs(cand.distanceM - primary.distanceM);
        if (diff < bestDistDiff) {
          bestDistDiff = diff;
          bestIdx = j;
        }
      }
      if (bestIdx !== -1) {
        usedUserIndices.add(bestIdx);
        matchedSecondary = userExtrema[bestIdx];
      }
    }

    const dM = primary.distanceM;
    const refPt = refGrid?.points[dM] ?? null;
    const userPt = userGrid?.points[dM] ?? null;

    const refSpeed = isRefPrimary
      ? primary.speedKmh
      : refPt?.speedKmh ?? null;

    const userSpeed = isRefPrimary
      ? matchedSecondary?.speedKmh ?? userPt?.speedKmh ?? null
      : primary.speedKmh;

    const refGear = isRefPrimary ? primary.gear : refPt?.gear ?? null;
    const userGear = isRefPrimary
      ? matchedSecondary?.gear ?? userPt?.gear ?? null
      : primary.gear;

    const x =
      primary.x ??
      matchedSecondary?.x ??
      userPt?.x ??
      refPt?.x ??
      null;
    const z =
      primary.z ??
      matchedSecondary?.z ??
      userPt?.z ??
      refPt?.z ??
      null;

    if (x === null || z === null) continue;

    const speedDeltaKmh =
      refSpeed !== null && userSpeed !== null ? userSpeed - refSpeed : null;

    // Compute time lost/gained across corner window [dM - 75m, dM + 75m]
    let cornerTimeLossS: number | null = null;
    if (comparison.length > 0) {
      const entryD = Math.max(0, dM - 75);
      const exitD = Math.min(comparison.length - 1, dM + 75);
      const deltaEntry = comparison[entryD]?.deltaTimeS;
      const deltaExit = comparison[exitD]?.deltaTimeS;
      if (
        deltaEntry !== null &&
        deltaEntry !== undefined &&
        deltaExit !== null &&
        deltaExit !== undefined
      ) {
        cornerTimeLossS = deltaExit - deltaEntry;
      }
    }

    const idx = primary.kind === 'vmin' ? cornerNumber++ : straightNumber++;
    const label = primary.kind === 'vmin' ? `T${idx}` : `S${idx}`;

    const refBrakeDistanceM =
      primary.kind === 'vmin' ? findBrakingPointBeforeApex(refGrid, dM) : null;
    const userBrakeDistanceM =
      primary.kind === 'vmin'
        ? findBrakingPointBeforeApex(userGrid, matchedSecondary?.distanceM ?? dM)
        : null;

    badges.push({
      id: `${primary.kind}-${idx}-${dM}`,
      kind: primary.kind,
      index: idx,
      label,
      distanceM: dM,
      progress: primary.progress,
      x,
      z,
      refSpeedKmh: refSpeed !== null ? Math.round(refSpeed) : null,
      userSpeedKmh: userSpeed !== null ? Math.round(userSpeed) : null,
      speedDeltaKmh: speedDeltaKmh !== null ? Math.round(speedDeltaKmh) : null,
      refGear,
      userGear,
      cornerTimeLossS,
      refBrakeDistanceM,
      userBrakeDistanceM,
    });
  }

  return badges;
}
