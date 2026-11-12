import {
  ApexFrameChannels,
  ApexFrameLine,
  ApexManifest,
  ApexStreamLine,
  ApexSummary,
  ApexTrack,
  ApexTrackPoint,
  ApexWheelChannels,
  computeArchiveCoverage,
  parseApexEntries,
  ParsedApexArchive,
} from './parser';

const FRAME_CHANNEL_KEYS = [
  'position',
  'velocity',
  'speedKmh',
  'splinePosition',
  'trackCoordinates',
  'yaw',
  'pitch',
  'roll',
  'gas',
  'brake',
  'clutch',
  'steer',
  'handbrake',
  'gear',
  'engagedGear',
  'rpm',
  'lapTimeMs',
  'bestLapTimeMs',
  'previousLapTimeMs',
  'lapCount',
  'sessionLapCount',
  'currentSector',
  'previousSectorTime',
  'racePosition',
  'currentSplits',
  'lastSplits',
  'bestSplits',
  'bestLapSplits',
  'fuel',
  'wheelsOutside',
  'resetCounter',
  'isInPit',
  'isInPitlane',
  'isRequestingPitStop',
  'isConnected',
  'isActive',
  'isRemote',
  'tyresName',
  'oilTemperature',
  'exhaustTemperature',
];

const WHEEL_CHANNEL_KEYS = [
  'tyreInsideTemperature',
  'tyreMiddleTemperature',
  'tyreOutsideTemperature',
  'tyreCoreTemperature',
  'tyrePressure',
  'tyreWear',
  'tyreGrain',
  'tyreBlister',
  'tyreFlatSpot',
  'tyreVirtualKM',
  'slipRatio',
  'slipAngle',
  'ndSlip',
  'angularSpeed',
  'loadK',
  'camber',
  'toeIn',
  'suspensionTravel',
  'brakeTemperature',
  'discTemperature',
  'surfaceValidTrack',
  'surfacePitlane',
];

interface CornerDefinition {
  centerP: number;
  widthP: number;
  minSpeedRef: number;
  minSpeedUser: number;
  gearRef: number;
  gearUser: number;
  direction: 1 | -1; // +1 right-hander, -1 left-hander
  brakeOffsetUserP: number; // positive = user brakes later, negative = user brakes earlier
}

const BARCELONA_CORNERS: CornerDefinition[] = [
  {
    centerP: 0.14,
    widthP: 0.042,
    minSpeedRef: 112,
    minSpeedUser: 105,
    gearRef: 3,
    gearUser: 3,
    direction: 1,
    brakeOffsetUserP: -0.004,
  },
  {
    centerP: 0.19,
    widthP: 0.032,
    minSpeedRef: 138,
    minSpeedUser: 134,
    gearRef: 3,
    gearUser: 3,
    direction: -1,
    brakeOffsetUserP: 0.0,
  },
  {
    centerP: 0.29,
    widthP: 0.055,
    minSpeedRef: 168,
    minSpeedUser: 161,
    gearRef: 4,
    gearUser: 4,
    direction: 1,
    brakeOffsetUserP: -0.003,
  },
  {
    centerP: 0.43,
    widthP: 0.046,
    minSpeedRef: 94,
    minSpeedUser: 89,
    gearRef: 2,
    gearUser: 2,
    direction: 1,
    brakeOffsetUserP: -0.005,
  },
  {
    centerP: 0.53,
    widthP: 0.044,
    minSpeedRef: 78,
    minSpeedUser: 71,
    gearRef: 2,
    gearUser: 3, // User stays in 3rd gear too high in slow hairpin
    direction: -1,
    brakeOffsetUserP: -0.004,
  },
  {
    centerP: 0.67,
    widthP: 0.038,
    minSpeedRef: 154,
    minSpeedUser: 156, // User slightly faster here
    gearRef: 4,
    gearUser: 4,
    direction: -1,
    brakeOffsetUserP: 0.002,
  },
  {
    centerP: 0.79,
    widthP: 0.046,
    minSpeedRef: 68,
    minSpeedUser: 63,
    gearRef: 1,
    gearUser: 2,
    direction: -1,
    brakeOffsetUserP: -0.005,
  },
  {
    centerP: 0.9,
    widthP: 0.042,
    minSpeedRef: 146,
    minSpeedUser: 140,
    gearRef: 3,
    gearUser: 3,
    direction: 1,
    brakeOffsetUserP: -0.003,
  },
];

/**
 * Generates a realistic 1000-point closed GP circuit spline in world meters (XZ plane).
 */
function buildRealisticCircuitTrack(lengthM = 4655): {
  track: ApexTrack;
  normals: ApexTrackPoint[];
  trueHalfWidths: number[];
} {
  const numPts = 1000;
  const points: ApexTrackPoint[] = [];
  const trueHalfWidths: number[] = [];

  for (let i = 0; i < numPts; i++) {
    const p = i / (numPts - 1);
    const theta = p * Math.PI * 2;

    // Multi-harmonic GP circuit loop with long main straight, technical infield, and hairpin
    const rX =
      480 * Math.cos(theta) +
      135 * Math.cos(2 * theta - 0.5) -
      85 * Math.sin(3 * theta + 0.4) +
      42 * Math.cos(5 * theta - 1.1);
    const rZ =
      310 * Math.sin(theta) +
      95 * Math.sin(2 * theta + 0.7) +
      68 * Math.cos(3 * theta - 0.8) -
      35 * Math.sin(4 * theta + 0.3);

    points.push({
      x: Number(rX.toFixed(4)),
      z: Number(rZ.toFixed(4)),
    });

    // Vary true track half-width between 6.2m (12.4m wide) and 8.5m (17m wide on main straight)
    const widthVar = 7.2 + 1.2 * Math.cos(theta) + 0.6 * Math.sin(3 * theta);
    trueHalfWidths.push(widthVar);
  }

  // Closed circuit repeats its first point as the last point (per schema.md)
  points[numPts - 1] = { ...points[0] };

  const normals: ApexTrackPoint[] = [];
  for (let i = 0; i < numPts; i++) {
    const prev = points[i > 0 ? i - 1 : numPts - 2];
    const next = points[i < numPts - 1 ? i + 1 : 1];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const len = Math.hypot(tx, tz) || 1;
    normals.push({
      x: -tz / len,
      z: tx / len,
    });
  }

  return {
    track: {
      schema: 1,
      track: {
        id: 'ks_barcelona',
        layout: 'layout_gp',
        name: 'Circuit de Barcelona-Catalunya GP',
        lengthM,
        closed: true,
        source: 'trackProgressToWorldCoordinate',
      },
      points,
    },
    normals,
    trueHalfWidths,
  };
}

/**
 * Synthesizes a realistic lap stream for either Reference ("Fast Guy", remote car)
 * or User ("Alex Rivera", local car), including a second lap with a `{"k":"note","m":"reset"}`
 * event for the user session.
 */
function synthesizeArchiveSession(
  role: 'ref' | 'user',
  circuit: ReturnType<typeof buildRealisticCircuitTrack>
): ParsedApexArchive {
  const isRemote = role === 'ref';
  const lengthM = circuit.track.track.lengthM!;
  const splinePts = circuit.track.points;
  const normals = circuit.normals;
  const halfWidths = circuit.trueHalfWidths;

  const manifest: ApexManifest = {
    schema: 1,
    app: 'apex-trace',
    version: '0.1.0',
    status: 'open',
    sessionId: role === 'ref' ? 'c998875d' : 'a41209ef',
    startedUtc: '2026-10-30T10:00:00Z',
    startedUnix: 1790000000,
    target: {
      driverName: role === 'ref' ? 'Fast Guy (Пилот А)' : 'Alex Rivera (Пилот Б)',
      sessionID: role === 'ref' ? 7 : 12,
      carModel: 'ks_ferrari_488_gt3',
      carSkin: role === 'ref' ? 'skin_00_red' : 'skin_04_afcorse',
      isRemote,
      isAi: false,
    },
    track: {
      id: 'ks_barcelona',
      layout: 'layout_gp',
      name: 'Circuit de Barcelona-Catalunya GP',
      lengthM,
      closed: true,
      spline: true,
      splineSource: 'trackProgressToWorldCoordinate',
    },
    server: {
      name: 'Apex GT3 Qualifying Server #1',
      ip: '127.0.0.1',
      httpPort: 8081,
    },
    sim: {
      online: true,
      sessionType: 2,
      ambientC: 21,
      roadC: 30,
      grip: 0.98,
    },
    channels: {
      frame: FRAME_CHANNEL_KEYS,
      wheels: WHEEL_CHANNEL_KEYS,
    },
    provenance: {
      wheels: 'netcode',
      note: 'load and every physics-only field are deliberately not recorded',
    },
  };

  const lines: ApexStreamLine[] = [];
  const frames: ApexFrameLine[] = [];
  let packetTimeMs = 10000;
  let clockS = 0.05;

  const generateLapFrames = (
    lapNumber: number,
    paceDeltaFactor: number,
    includeResetAtProgress?: number
  ) => {
    const steps = 650;
    let currentP = 0;
    const lapStartT = packetTimeMs;
    let currentSector = 0;
    let sectorStartT = packetTimeMs;
    let resetTriggered = false;
    let resetCounter = 0;

    for (let step = 0; step <= steps; step++) {
      currentP = step / steps;

      // If this lap has a simulated teleport to pits (`{"k": "note", "m": "reset"}`), trigger it
      if (
        includeResetAtProgress !== undefined &&
        !resetTriggered &&
        currentP >= includeResetAtProgress
      ) {
        resetTriggered = true;
        resetCounter += 1;
        lines.push({
          k: 'note',
          c: Number(clockS.toFixed(3)),
          t: Math.round(packetTimeMs),
          m: 'reset',
        });
        // Teleport car to pitlane entry (progress jumps to 0.94)
        step = Math.floor(0.94 * steps);
        currentP = step / steps;
      }

      // Compute target speed, pedals, steering, and racing line lateral offset
      const topStraightSpeed = role === 'ref' ? 264 : 261;
      let targetSpeed =
        topStraightSpeed -
        8 * Math.sin(currentP * Math.PI * 4) -
        paceDeltaFactor * 2.5;
      let gas = 1.0;
      let brake = 0.0;
      let steer = 0.0;
      let gear = 6;
      // Racing line lateral offset (-1 left, +1 right)
      let lateral = -0.55 * Math.sin(currentP * Math.PI * 6);

      for (const c of BARCELONA_CORNERS) {
        const apexP = c.centerP + (role === 'user' ? c.brakeOffsetUserP : 0);
        const distP = currentP - apexP;
        const normDist = distP / c.widthP;

        if (Math.abs(normDist) < 2.2) {
          const minV =
            (role === 'ref' ? c.minSpeedRef : c.minSpeedUser) - paceDeltaFactor * 1.5;
          // Gaussian-like speed dip through corner
          const dip = Math.exp(-0.5 * normDist * normDist * 2.2);
          const cornerV = topStraightSpeed - (topStraightSpeed - minV) * dip;

          if (cornerV < targetSpeed) {
            targetSpeed = cornerV;
          }

          // Braking zone on corner entry (-1.8 < normDist < -0.15)
          if (normDist >= -1.85 && normDist <= -0.1) {
            const brakeIntensity = Math.sin(
              ((normDist + 1.85) / 1.75) * Math.PI
            );
            brake = Math.max(brake, Math.min(1, brakeIntensity * 0.98));
            gas = 0.0;
          } else if (normDist > -0.1 && normDist < 0.35) {
            // Coasting / trail-braking around apex
            brake = Math.max(0, 0.25 * (1 - (normDist + 0.1) / 0.45));
            gas = Math.min(1, Math.max(0, (normDist + 0.05) * 2.2));
          } else if (normDist >= 0.35 && normDist < 1.5) {
            // Corner exit throttle application
            brake = 0;
            gas = Math.min(1, 0.45 + (normDist - 0.35) * 0.75);
          }

          // Steering angle through corner
          if (Math.abs(normDist) < 1.4) {
            const steerPeak = (280 - minV) * 0.55 * c.direction;
            steer += steerPeak * Math.exp(-normDist * normDist * 1.8);
          }

          // Racing line: wide on entry (-direction * 0.75) -> apex (+direction * 0.82) -> wide on exit (-direction * 0.78)
          if (Math.abs(normDist) < 1.6) {
            const apexClip = Math.cos(normDist * 1.9);
            lateral = c.direction * (0.82 * apexClip - 0.15);
          }

          if (Math.abs(normDist) < 0.85) {
            gear = role === 'ref' ? c.gearRef : c.gearUser;
          }
        }
      }

      // Compute gear from speed if not overridden at apex
      if (gear === 6) {
        if (targetSpeed < 80) gear = 1;
        else if (targetSpeed < 118) gear = 2;
        else if (targetSpeed < 156) gear = 3;
        else if (targetSpeed < 196) gear = 4;
        else if (targetSpeed < 236) gear = 5;
        else gear = 6;
      }

      lateral = Math.max(-0.95, Math.min(0.95, lateral));

      // Map progress + lateral to exact world [x, y, z] using the track spline and normal
      const splineIdx = Math.min(
        splinePts.length - 1,
        Math.max(0, Math.round(currentP * (splinePts.length - 1)))
      );
      const centerPt = splinePts[splineIdx];
      const normVec = normals[splineIdx];
      const localHalfWidth = halfWidths[splineIdx];

      const worldX = centerPt.x + normVec.x * (lateral * localHalfWidth);
      const worldZ = centerPt.z + normVec.z * (lateral * localHalfWidth);

      // Advance time based on distance step and current speed
      const stepMeters = lengthM / steps;
      const speedMs = Math.max(15, targetSpeed / 3.6);
      const dtSeconds = resetTriggered && currentP === Math.floor(0.94 * steps) / steps
        ? 1.5
        : stepMeters / speedMs;

      if (step > 0) {
        packetTimeMs += dtSeconds * 1000;
        clockS += dtSeconds;
      }

      // Sector boundaries at 0.33 and 0.66
      const newSector = currentP < 0.333 ? 0 : currentP < 0.666 ? 1 : 2;
      if (newSector !== currentSector) {
        const sectorTimeMs = Math.round(packetTimeMs - sectorStartT);
        lines.push({
          k: 'sector',
          c: Number(clockS.toFixed(3)),
          t: Math.round(packetTimeMs),
          n: newSector,
          timeMs: sectorTimeMs,
        });
        currentSector = newSector;
        sectorStartT = packetTimeMs;
      }

      const rpm = Math.round(
        4200 + ((targetSpeed % 48) / 48) * 3100 + (gas > 0.8 ? 350 : 0)
      );

      const frameChannels: ApexFrameChannels = {
        position: [Number(worldX.toFixed(3)), 1.45, Number(worldZ.toFixed(3))],
        velocity: [0, 0, Number(speedMs.toFixed(2))],
        speedKmh: Number(targetSpeed.toFixed(1)),
        splinePosition: Number(currentP.toFixed(5)),
        trackCoordinates: [
          Number(lateral.toFixed(4)),
          0.4,
          Number(currentP.toFixed(5)),
        ],
        yaw: Number(((currentP * 360) % 360).toFixed(2)),
        pitch: Number((brake > 0.2 ? -1.4 * brake : gas * 0.4).toFixed(2)),
        roll: Number((steer * 0.035).toFixed(2)),
        gas: Number(gas.toFixed(3)),
        brake: Number(brake.toFixed(3)),
        clutch: 0,
        steer: Number(steer.toFixed(2)),
        handbrake: 0,
        gear,
        engagedGear: gear,
        rpm,
        lapTimeMs: Math.round(packetTimeMs - lapStartT),
        bestLapTimeMs: role === 'ref' ? 103140 : 104590,
        previousLapTimeMs: role === 'ref' ? 103820 : 105120,
        lapCount: lapNumber,
        sessionLapCount: lapNumber + 2,
        currentSector: newSector,
        previousSectorTime: 34120,
        racePosition: role === 'ref' ? 1 : 4,
        currentSplits: [33850, 68420, 0],
        lastSplits: [34010, 68900, 103820],
        bestSplits: [33710, 68120, 103140],
        bestLapSplits: [33710, 68120, 103140],
        fuel: Number((35.0 - lapNumber * 2.4 - currentP * 2.4).toFixed(2)),
        wheelsOutside: Math.abs(lateral) > 0.92 ? 2 : 0,
        resetCounter,
        isInPit: false,
        isInPitlane: resetTriggered,
        isRequestingPitStop: false,
        isConnected: true,
        isActive: true,
        isRemote,
        tyresName: 'SM',
        oilTemperature: Number((92 + currentP * 2.5).toFixed(1)),
        exhaustTemperature: Number((520 + gas * 85).toFixed(0)),
      };

      // Build 4 wheel channel objects.
      // Per 0005-null-is-not-zero.md & 0001.ndjson sample:
      // Remote cars have `toeIn: null`, `suspensionTravel: null`, `discTemperature: null`.
      const makeWheel = (cornerIdx: number): ApexWheelChannels => {
        const isLeft = cornerIdx === 0 || cornerIdx === 2;
        const cornerLoadBoost = isLeft ? steer * 3.2 : -steer * 3.2;
        const tempBase = 82 + brake * 8 + Math.abs(steer) * 0.08 + cornerIdx * 0.8;
        return {
          tyreInsideTemperature: Number((tempBase + 1.5).toFixed(1)),
          tyreMiddleTemperature: Number((tempBase + 0.6).toFixed(1)),
          tyreOutsideTemperature: Number((tempBase - 0.4).toFixed(1)),
          tyreCoreTemperature: Number((tempBase + 2.1).toFixed(1)),
          tyrePressure: Number((26.2 + currentP * 0.3).toFixed(2)),
          tyreWear: Number((0.12 + lapNumber * 0.02 + currentP * 0.01).toFixed(3)),
          tyreGrain: 0,
          tyreBlister: 0,
          tyreFlatSpot: 0,
          tyreVirtualKM: Number((12.5 + currentP * 4.65).toFixed(2)),
          slipRatio: Number((brake > 0.3 ? -0.04 * brake : gas * 0.03).toFixed(4)),
          slipAngle: Number((steer * 0.045).toFixed(3)),
          ndSlip: Number(
            Math.min(1.2, Math.abs(steer) * 0.006 + brake * 0.35 + gas * 0.18).toFixed(3)
          ),
          angularSpeed: Number((speedMs / 0.33).toFixed(1)),
          loadK: Math.round(Math.max(400, 1620 + cornerLoadBoost + (brake - gas) * 240)),
          camber: -3.2,
          toeIn: isRemote ? null : Number((cornerIdx < 2 ? 0.08 : -0.12).toFixed(2)),
          suspensionTravel: isRemote
            ? null
            : Number((0.045 + (brake > 0.2 && cornerIdx < 2 ? 0.018 : 0)).toFixed(4)),
          brakeTemperature: Math.round(360 + brake * 290),
          discTemperature: isRemote ? null : Math.round(390 + brake * 320),
          surfaceValidTrack: Math.abs(lateral) <= 0.94,
          surfacePitlane: resetTriggered,
        };
      };

      const frameLine: ApexFrameLine = {
        k: 'frame',
        t: Math.round(packetTimeMs),
        c: Number(clockS.toFixed(3)),
        lap: lapNumber,
        f: frameChannels,
        w: [makeWheel(0), makeWheel(1), makeWheel(2), makeWheel(3)],
      };

      lines.push(frameLine);
      frames.push(frameLine);
    }

    const totalLapTimeMs = Math.round(packetTimeMs - lapStartT);
    lines.push({
      k: 'lap',
      c: Number(clockS.toFixed(3)),
      t: Math.round(packetTimeMs),
      n: lapNumber + 1,
      timeMs: totalLapTimeMs,
      bestMs: role === 'ref' ? 103140 : 104590,
      valid: !resetTriggered,
      cuts: resetTriggered ? 1 : 0,
    });
  };

  if (role === 'ref') {
    // Reference Archive: Lap 1 (Fast Qualifying Lap) & Lap 2 (Warmup/Baseline Lap)
    generateLapFrames(1, 0.0);
    generateLapFrames(2, 0.55);
  } else {
    // User Archive: Lap 1 (Clean comparison lap) & Lap 2 (Lap with {"k":"note","m":"reset"} teleport!)
    generateLapFrames(1, 0.25);
    generateLapFrames(2, 0.4, 0.58);
  }

  const coverage = computeArchiveCoverage(manifest, frames);
  const summary: ApexSummary = {
    schema: 1,
    app: 'apex-trace',
    version: '0.1.0',
    status: 'closed',
    sessionId: manifest.sessionId,
    endedUtc: '2026-10-30T10:06:00Z',
    reason: 'user',
    frames: frames.length,
    laps: 2,
    chunks: 2,
    bytes: frames.length * 1450,
    durationS: Number(clockS.toFixed(1)),
    coverage,
    log: { start: 1 },
  };

  return {
    fileName:
      role === 'ref'
        ? 'barcelona_ref_fast_guy_c998875d.apex.zip'
        : 'barcelona_user_alex_a41209ef.apex.zip',
    manifest,
    track: circuit.track,
    summary,
    hasCleanSummary: true,
    computedCoverage: coverage,
    dumpCar: null,
    lines,
    frames,
    lapEvents: lines.filter((l): l is Extract<ApexStreamLine, { k: 'lap' }> => l.k === 'lap'),
    sectorEvents: lines.filter(
      (l): l is Extract<ApexStreamLine, { k: 'sector' }> => l.k === 'sector'
    ),
    noteEvents: lines.filter(
      (l): l is Extract<ApexStreamLine, { k: 'note' }> => l.k === 'note'
    ),
    chunkNames: ['frames/0001.ndjson', 'frames/0002.ndjson'],
    warnings: [],
  };
}

/**
 * Generates both Reference (Archive 1) and User (Archive 2) demo sessions
 * for immediate interactive inspection.
 */
export function generateBuiltInDemoSessions(): {
  refArchive: ParsedApexArchive;
  userArchive: ParsedApexArchive;
} {
  const circuit = buildRealisticCircuitTrack(4655);
  const refArchive = synthesizeArchiveSession('ref', circuit);
  const userArchive = synthesizeArchiveSession('user', circuit);
  return { refArchive, userArchive };
}

/**
 * Loads the exact real sample files attached by the user from /assets/aistudio/...
 * (`manifest_1b5179be.json`, `track_25aaab32.json`, `0001.ndjson_da4d56f2.txt`,
 * `summary_b5976f41.json`, `dump_car_c3d2931d.json`)
 */
export async function loadAttachedSpecSampleArchive(
  simulateMissingSummary = false
): Promise<ParsedApexArchive> {
  const [manifestTxt, trackTxt, framesTxt, summaryTxt, dumpTxt] = await Promise.all([
    fetch('./assets/aistudio/manifest_1b5179be.json').then((r) => r.text()),
    fetch('./assets/aistudio/track_25aaab32.json').then((r) => r.text()),
    fetch('./assets/aistudio/0001.ndjson_da4d56f2.txt').then((r) => r.text()),
    fetch('./assets/aistudio/summary_b5976f41.json').then((r) => r.text()),
    fetch('./assets/aistudio/dump_car_c3d2931d.json').then((r) => r.text()),
  ]);

  const entries: Record<string, string> = {
    'manifest.json': manifestTxt,
    'track.json': trackTxt,
    'frames/0001.ndjson': framesTxt,
    'dump_car.json': dumpTxt,
  };

  if (!simulateMissingSummary) {
    entries['summary.json'] = summaryTxt;
  }

  return parseApexEntries(
    simulateMissingSummary
      ? 'sample_c998875d_unclean_stop.apex.zip'
      : 'sample_c998875d_spec.apex.zip',
    entries
  );
}
