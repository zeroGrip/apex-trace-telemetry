import { ApexFrameLine, ApexTrack, ApexTrackPoint } from './parser';

export interface ReconstructedTrackNode {
  progress: number;
  distanceM: number;
  center: ApexTrackPoint;
  normal: ApexTrackPoint;
  halfWidthM: number;
  leftEdge: ApexTrackPoint;
  rightEdge: ApexTrackPoint;
}

export interface ReconstructedTrackSurface {
  closed: boolean;
  lengthM: number;
  source: 'spline+lateral' | 'spline+median' | 'frames-fallback';
  medianHalfWidthM: number;
  measuredSamplesCount: number;
  nodes: ReconstructedTrackNode[];
  bounds: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    width: number;
    height: number;
  };
}

/**
 * Interpolates a spline point S(p) and raw normal vector N(p) at normalized progress p in [0, 1].
 */
function sampleSplineAndNormal(
  points: ApexTrackPoint[],
  closed: boolean,
  p: number
): { center: ApexTrackPoint; normal: ApexTrackPoint } {
  const n = points.length;
  const clampedP = Math.max(0, Math.min(1, p));
  const exactIdx = clampedP * (n - 1);
  const idx0 = Math.min(n - 1, Math.floor(exactIdx));
  const idx1 = Math.min(n - 1, idx0 + 1);
  const frac = exactIdx - idx0;

  const p0 = points[idx0];
  const p1 = points[idx1];
  const center: ApexTrackPoint = {
    x: p0.x + (p1.x - p0.x) * frac,
    z: p0.z + (p1.z - p0.z) * frac,
  };

  // Compute tangent vector using neighbor points
  const prevIdx = idx0 > 0 ? idx0 - 1 : closed ? n - 2 : 0;
  const nextIdx = idx0 < n - 1 ? idx0 + 1 : closed ? 1 : n - 1;
  const tx = points[nextIdx].x - points[prevIdx].x;
  const tz = points[nextIdx].z - points[prevIdx].z;
  const len = Math.hypot(tx, tz);

  if (len < 1e-6) {
    return { center, normal: { x: 1, z: 0 } };
  }

  // Perpendicular in XZ plane
  return {
    center,
    normal: {
      x: -tz / len,
      z: tx / len,
    },
  };
}

/**
 * Reconstructs the asphalt boundaries (leftEdge and rightEdge) using the exact mathematical
 * algorithm from Section 3.1:
 *
 * 1. In `track.json`, `points: [{x, z}]` defines the center/AI spline S(p).
 * 2. In `frames/NNNN.ndjson`, each frame has `f.position: [x, y, z]` and `f.trackCoordinates: [lateral, height, progress]`.
 * 3. Since `lateral` is -1 on the left edge, 0 at the center, and +1 on the right edge:
 *    - For each frame where |lateral| > 0.15, we take S(p) and the unit normal N(p) in the XZ plane.
 *    - Signed distance along normal: d = (P_car - S(p)) . N(p).
 *    - Local half-width: W(p) = d / lateral.
 * 4. Smooth W(p) with a moving average and build:
 *    E_left(p) = S(p) - N(p) * W(p)
 *    E_right(p) = S(p) + N(p) * W(p)
 */
export function buildTrackSurface(
  track: ApexTrack | null,
  framesList: ApexFrameLine[][],
  fallbackLengthM?: number | null
): ReconstructedTrackSurface | null {
  const allFrames = framesList.flat();

  // Obtain center spline points from track.json, or fallback to car trajectory if track.json is absent
  let splinePoints: ApexTrackPoint[] = [];
  let closed = true;
  let lengthM = fallbackLengthM && fallbackLengthM > 0 ? fallbackLengthM : 4655;
  let usingFallbackSpline = false;

  if (track && Array.isArray(track.points) && track.points.length >= 2) {
    splinePoints = track.points;
    closed = track.track?.closed !== false;
    if (typeof track.track?.lengthM === 'number' && track.track.lengthM > 0) {
      lengthM = track.track.lengthM;
    }
  } else {
    // Fallback when track.json is absent (manifest.track.spline === false)
    usingFallbackSpline = true;
    const sortedByProg: { p: number; x: number; z: number }[] = [];
    for (const fr of allFrames) {
      const pos = fr.f?.position;
      const prog =
        typeof fr.f?.splinePosition === 'number'
          ? fr.f.splinePosition
          : Array.isArray(fr.f?.trackCoordinates)
          ? fr.f.trackCoordinates[2]
          : null;
      if (Array.isArray(pos) && typeof prog === 'number') {
        sortedByProg.push({ p: prog, x: pos[0], z: pos[2] });
      }
    }
    if (sortedByProg.length < 2) {
      return null;
    }
    sortedByProg.sort((a, b) => a.p - b.p);
    splinePoints = sortedByProg.map((pt) => ({ x: pt.x, z: pt.z }));
  }

  const numNodes = splinePoints.length;

  // Step 1: Precompute S(p) and initial unit normal N(p) at each spline node
  const baseNodes: { progress: number; center: ApexTrackPoint; normal: ApexTrackPoint }[] = [];
  for (let i = 0; i < numNodes; i++) {
    const progress = numNodes > 1 ? i / (numNodes - 1) : 0;
    const { center, normal } = sampleSplineAndNormal(splinePoints, closed, progress);
    baseNodes.push({ progress, center, normal });
  }

  // Step 2: Determine normal orientation sign (+1 or -1) so that d = (P_car - S(p)) . N(p)
  // has the same sign as `lateral` (where lateral = -1 is left and +1 is right).
  let signVotesPositive = 0;
  let signVotesNegative = 0;

  const rawWidthSamples: { binIdx: number; halfWidth: number }[] = [];

  for (const fr of allFrames) {
    const pos = fr.f?.position;
    const tc = fr.f?.trackCoordinates;
    if (!Array.isArray(pos) || !Array.isArray(tc)) continue;

    const lateral = tc[0];
    const progress =
      typeof tc[2] === 'number'
        ? tc[2]
        : typeof fr.f?.splinePosition === 'number'
        ? fr.f.splinePosition
        : null;

    if (
      typeof lateral !== 'number' ||
      typeof progress !== 'number' ||
      !Number.isFinite(lateral) ||
      !Number.isFinite(progress)
    ) {
      continue;
    }

    // Filter frames where |lateral| > 0.15 to avoid dividing by numbers close to zero
    if (Math.abs(lateral) <= 0.15) continue;

    const binIdx = Math.max(0, Math.min(numNodes - 1, Math.round(progress * (numNodes - 1))));
    const node = baseNodes[binIdx];

    const dx = pos[0] - node.center.x;
    const dz = pos[2] - node.center.z;
    const dot = dx * node.normal.x + dz * node.normal.z;
    const rawRatio = dot / lateral;

    // Physical sanity check: a racing circuit half-width is between 3.5m and 25m
    const absWidth = Math.abs(rawRatio);
    if (absWidth >= 3.5 && absWidth <= 25.0) {
      if (rawRatio > 0) signVotesPositive++;
      else signVotesNegative++;
      rawWidthSamples.push({ binIdx, halfWidth: absWidth });
    }
  }

  // Flip normal vectors if needed so N(p) always points toward lateral > 0 (right edge)
  const normalSign = signVotesNegative > signVotesPositive ? -1 : 1;
  if (normalSign === -1) {
    for (const node of baseNodes) {
      node.normal.x *= -1;
      node.normal.z *= -1;
    }
  }

  // Step 3: Compute median half-width across valid samples (fallback to 7.0m => 14m total track width if none)
  let medianHalfWidthM = 7.0;
  if (rawWidthSamples.length > 0) {
    const sortedW = rawWidthSamples.map((s) => s.halfWidth).sort((a, b) => a - b);
    medianHalfWidthM = sortedW[Math.floor(sortedW.length / 2)];
  }

  // Bin widths along spline nodes
  const binSums = new Float64Array(numNodes);
  const binCounts = new Uint32Array(numNodes);

  for (const sample of rawWidthSamples) {
    binSums[sample.binIdx] += sample.halfWidth;
    binCounts[sample.binIdx] += 1;
  }

  const unsmoothedW = new Float64Array(numNodes);
  for (let i = 0; i < numNodes; i++) {
    unsmoothedW[i] = binCounts[i] > 0 ? binSums[i] / binCounts[i] : medianHalfWidthM;
  }

  // Interpolate between measured bins before smoothing so sparse measurements blend smoothly
  const smoothedW = new Float64Array(numNodes);
  const windowRadius = Math.max(4, Math.round(numNodes * 0.025));

  for (let i = 0; i < numNodes; i++) {
    let sum = 0;
    let weightSum = 0;
    for (let k = -windowRadius; k <= windowRadius; k++) {
      let idx = i + k;
      if (closed) {
        idx = ((idx % numNodes) + numNodes) % numNodes;
      } else {
        idx = Math.max(0, Math.min(numNodes - 1, idx));
      }
      const w = 1 - Math.abs(k) / (windowRadius + 1);
      // Give slightly higher weight to bins that had actual car lateral measurements
      const measurementBoost = binCounts[idx] > 0 ? 2.5 : 1.0;
      sum += unsmoothedW[idx] * w * measurementBoost;
      weightSum += w * measurementBoost;
    }
    smoothedW[i] = weightSum > 0 ? sum / weightSum : medianHalfWidthM;
  }

  // Step 4: Construct E_left(p) = S(p) - N(p) * W(p) and E_right(p) = S(p) + N(p) * W(p)
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const nodes: ReconstructedTrackNode[] = new Array(numNodes);
  for (let i = 0; i < numNodes; i++) {
    const base = baseNodes[i];
    const w = smoothedW[i];

    const leftEdge: ApexTrackPoint = {
      x: base.center.x - base.normal.x * w,
      z: base.center.z - base.normal.z * w,
    };
    const rightEdge: ApexTrackPoint = {
      x: base.center.x + base.normal.x * w,
      z: base.center.z + base.normal.z * w,
    };

    if (leftEdge.x < minX) minX = leftEdge.x;
    if (leftEdge.x > maxX) maxX = leftEdge.x;
    if (leftEdge.z < minZ) minZ = leftEdge.z;
    if (leftEdge.z > maxZ) maxZ = leftEdge.z;

    if (rightEdge.x < minX) minX = rightEdge.x;
    if (rightEdge.x > maxX) maxX = rightEdge.x;
    if (rightEdge.z < minZ) minZ = rightEdge.z;
    if (rightEdge.z > maxZ) maxZ = rightEdge.z;

    nodes[i] = {
      progress: base.progress,
      distanceM: base.progress * lengthM,
      center: base.center,
      normal: base.normal,
      halfWidthM: w,
      leftEdge,
      rightEdge,
    };
  }

  return {
    closed,
    lengthM,
    source: usingFallbackSpline
      ? 'frames-fallback'
      : rawWidthSamples.length > 0
      ? 'spline+lateral'
      : 'spline+median',
    medianHalfWidthM,
    measuredSamplesCount: rawWidthSamples.length,
    nodes,
    bounds: {
      minX,
      maxX,
      minZ,
      maxZ,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxZ - minZ),
    },
  };
}
