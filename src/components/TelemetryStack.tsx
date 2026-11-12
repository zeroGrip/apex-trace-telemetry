import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { ZoomOut, SlidersHorizontal } from 'lucide-react';
import { useTelemetry } from '../store/useTelemetry';
import { useI18n } from '../i18n/translations';
import { ComparisonPoint } from '../core/resampler';

interface ChannelPlotSpec {
  id: 'delta' | 'speed' | 'gear' | 'pedals' | 'steer' | 'wheels';
  title: string;
  unit: string;
  heightPx: number;
}

export const TelemetryStack: React.FC = () => {
  const {
    refSession,
    userSession,
    refLap,
    userLap,
    comparisonGrid,
    extremaBadges,
    trackLengthM,
    cursorDistanceM,
    setCursorDistanceM,
    zoomRangeM,
    setZoomRangeM,
  } = useTelemetry();

  const { t } = useI18n();

  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);

  const [canvasWidth, setCanvasWidth] = useState<number>(800);
  const [showWheelNetcodeChannel, setShowWheelNetcodeChannel] = useState<boolean>(false);
  const [dragSelect, setDragSelect] = useState<{ startX: number; currentX: number } | null>(null);

  // Determine which channels have non-null data in the selected laps (strictly obeying null-is-not-zero)
  const hasPedals = Boolean(
    refLap?.availability.gas ||
      refLap?.availability.brake ||
      refLap?.availability.clutch ||
      userLap?.availability.gas ||
      userLap?.availability.brake ||
      userLap?.availability.clutch
  );
  const hasSteer = Boolean(refLap?.availability.steer || userLap?.availability.steer);
  const hasWheels = Boolean(
    refLap?.availability.loadK ||
      userLap?.availability.loadK ||
      refLap?.availability.tyreTemps ||
      userLap?.availability.tyreTemps
  );

  const activePlots = useMemo<ChannelPlotSpec[]>(() => {
    const list: ChannelPlotSpec[] = [
      { id: 'delta', title: t.telemetryStack.plotDelta, unit: t.common.secondsShort, heightPx: 92 },
      { id: 'speed', title: t.telemetryStack.plotSpeed, unit: t.common.kmh, heightPx: 145 },
      { id: 'gear', title: t.telemetryStack.plotGear, unit: t.common.gearShort, heightPx: 86 },
    ];
    if (hasPedals) {
      list.push({
        id: 'pedals',
        title: t.telemetryStack.plotPedals,
        unit: '%',
        heightPx: 110,
      });
    }
    if (hasSteer) {
      list.push({
        id: 'steer',
        title: t.telemetryStack.plotSteer,
        unit: t.common.degShort,
        heightPx: 92,
      });
    }
    if (showWheelNetcodeChannel && hasWheels) {
      list.push({
        id: 'wheels',
        title: t.telemetryStack.plotWheels,
        unit: t.common.newtonsShort,
        heightPx: 95,
      });
    }
    return list;
  }, [hasPedals, hasSteer, hasWheels, showWheelNetcodeChannel, t]);

  const totalCanvasHeight = useMemo(() => {
    return activePlots.reduce((acc, p) => acc + p.heightPx, 0) + 32; // +32px for bottom distance axis
  }, [activePlots]);

  // Visible distance window [startM, endM]
  const [viewStartM, viewEndM] = useMemo<[number, number]>(() => {
    if (zoomRangeM) {
      return [
        Math.max(0, Math.min(trackLengthM - 10, zoomRangeM[0])),
        Math.min(trackLengthM, Math.max(zoomRangeM[0] + 10, zoomRangeM[1])),
      ];
    }
    return [0, Math.max(100, trackLengthM)];
  }, [zoomRangeM, trackLengthM]);

  const leftPad = 56;
  const rightPad = 18;

  const xToDistanceM = useCallback(
    (px: number, width: number): number => {
      const plotW = Math.max(50, width - leftPad - rightPad);
      const ratio = Math.max(0, Math.min(1, (px - leftPad) / plotW));
      return Math.round(viewStartM + ratio * (viewEndM - viewStartM));
    },
    [viewStartM, viewEndM]
  );

  const distanceMToX = useCallback(
    (d: number, width: number): number => {
      const plotW = Math.max(50, width - leftPad - rightPad);
      const span = Math.max(1, viewEndM - viewStartM);
      return leftPad + ((d - viewStartM) / span) * plotW;
    },
    [viewStartM, viewEndM]
  );

  const avgFourWheelsLoadK = useCallback(
    (pt: ComparisonPoint['ref'] | ComparisonPoint['user']): number | null => {
      const w = pt?.wheels;
      if (!w) return null;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < 4; i++) {
        const v = w[i]?.loadK;
        if (v !== null && v !== undefined && Number.isFinite(v)) {
          sum += v;
          count++;
        }
      }
      return count > 0 ? sum / count : null;
    },
    []
  );

  // Track container width via ResizeObserver so both layers stay crisp
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const w = Math.max(320, Math.floor(rect.width));
      setCanvasWidth((prev) => (prev !== w ? w : prev));
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // =========================================================================
  // LAYER 1 (STATIC BASE CANVAS): Grid, Axes, Extrema Guides, and Channel Traces
  // Does NOT depend on cursorDistanceM or dragSelect -> zero re-draw on mouse move
  // =========================================================================
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvasWidth;
    const height = totalCanvasHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Fill background (Pure OLED Black)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    const startM = Math.max(0, Math.floor(viewStartM));
    const endM = Math.min(comparisonGrid.length - 1, Math.ceil(viewEndM));

    // Calculate vertical distance grid lines
    const spanM = Math.max(1, viewEndM - viewStartM);
    const rawStep = spanM / 8;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const residual = rawStep / mag;
    const gridStepM =
      residual > 5 ? 10 * mag : residual > 2 ? 5 * mag : residual > 1 ? 2 * mag : mag;

    const firstTickM = Math.ceil(viewStartM / gridStepM) * gridStepM;

    // Draw vertical distance grid lines across full height
    ctx.strokeStyle = 'rgba(38, 38, 38, 0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let m = firstTickM; m <= viewEndM; m += gridStepM) {
      const x = distanceMToX(m, width);
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height - 28);
    }
    ctx.stroke();

    // Subtle vertical guides for detected corners (T1, T2, ...)
    for (const badge of extremaBadges) {
      if (badge.kind !== 'vmin') continue;
      if (badge.distanceM < viewStartM || badge.distanceM > viewEndM) continue;
      const bx = distanceMToX(badge.distanceM, width);
      ctx.strokeStyle = 'rgba(115, 115, 115, 0.25)';
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(bx, 0);
      ctx.lineTo(bx, height - 28);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Helper to draw a continuous/dashed trace that strictly breaks on `null` or `isResetGap`
    const drawTrace = (
      topY: number,
      bandH: number,
      minVal: number,
      maxVal: number,
      getter: (pt: ComparisonPoint) => number | null,
      getSegmentId: (pt: ComparisonPoint) => number | null,
      color: string,
      dashed: boolean,
      stepWise = false,
      lineWidth = 1.8
    ) => {
      const padY = 14;
      const innerH = Math.max(10, bandH - padY * 2);
      const valSpan = Math.max(1e-5, maxVal - minVal);

      const valToY = (v: number) => {
        const norm = (v - minVal) / valSpan;
        return topY + padY + innerH * (1 - Math.max(0, Math.min(1, norm)));
      };

      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.setLineDash(dashed ? [6, 4] : []);
      ctx.beginPath();

      let penDown = false;
      let prevY = 0;
      let prevSegId: number | null = null;

      // Step stride for performance when viewing full 5000m lap
      const stride = spanM > 2500 ? 2 : 1;

      for (let m = startM; m <= endM; m += stride) {
        const comp = comparisonGrid[m];
        if (!comp) {
          penDown = false;
          continue;
        }
        const val = getter(comp);
        const segId = getSegmentId(comp);

        // Rule: "null is not zero" + break line on note="reset" segment changes
        if (val === null || !Number.isFinite(val) || (prevSegId !== null && segId !== prevSegId)) {
          penDown = false;
          prevSegId = segId;
          continue;
        }

        const x = distanceMToX(m, width);
        const y = valToY(val);

        if (!penDown) {
          ctx.moveTo(x, y);
          penDown = true;
        } else {
          if (stepWise) {
            ctx.lineTo(x, prevY);
            ctx.lineTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        prevY = y;
        prevSegId = segId;
      }

      ctx.stroke();
      ctx.setLineDash([]);
    };

    let currentTopY = 0;

    for (const plot of activePlots) {
      const bandH = plot.heightPx;
      const padY = 14;
      const innerH = Math.max(10, bandH - padY * 2);

      // Draw horizontal separator at bottom of band
      ctx.strokeStyle = '#1F1F1F';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, currentTopY + bandH);
      ctx.lineTo(width, currentTopY + bandH);
      ctx.stroke();

      // Left axis background gutter (OLED near-black)
      ctx.fillStyle = '#050505';
      ctx.fillRect(0, currentTopY, leftPad - 1, bandH - 1);

      if (plot.id === 'delta') {
        let maxAbsDelta = 0.5;
        for (let m = startM; m <= endM; m += 2) {
          const dt = comparisonGrid[m]?.deltaTimeS;
          if (dt !== null && dt !== undefined && Number.isFinite(dt)) {
            if (Math.abs(dt) > maxAbsDelta) maxAbsDelta = Math.abs(dt);
          }
        }
        maxAbsDelta = Math.ceil(maxAbsDelta * 1.15 * 10) / 10;

        const zeroY = currentTopY + padY + innerH / 2;
        ctx.strokeStyle = 'rgba(115, 115, 115, 0.4)';
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(leftPad, zeroY);
        ctx.lineTo(width - rightPad, zeroY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Shaded area under Delta-T curve
        ctx.fillStyle = 'rgba(244, 63, 94, 0.14)';
        ctx.beginPath();
        let startedFill = false;
        let firstX = leftPad;
        let lastX = leftPad;

        for (let m = startM; m <= endM; m += 2) {
          const dt = comparisonGrid[m]?.deltaTimeS;
          if (dt === null || dt === undefined) continue;
          const x = distanceMToX(m, width);
          const norm = (dt - -maxAbsDelta) / (2 * maxAbsDelta);
          const y = currentTopY + padY + innerH * (1 - Math.max(0, Math.min(1, norm)));
          if (!startedFill) {
            firstX = x;
            ctx.moveTo(x, zeroY);
            ctx.lineTo(x, y);
            startedFill = true;
          } else {
            ctx.lineTo(x, y);
          }
          lastX = x;
        }
        if (startedFill) {
          ctx.lineTo(lastX, zeroY);
          ctx.lineTo(firstX, zeroY);
          ctx.closePath();
          ctx.fill();
        }

        drawTrace(
          currentTopY,
          bandH,
          -maxAbsDelta,
          maxAbsDelta,
          (c) => c.deltaTimeS,
          (c) => c.user?.segmentId ?? c.ref?.segmentId ?? null,
          '#F43F5E',
          false,
          false,
          2.0
        );

        // Y-axis labels
        ctx.fillStyle = '#737373';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`+${maxAbsDelta.toFixed(1)}s`, leftPad - 6, currentTopY + padY);
        ctx.fillText('0.0s', leftPad - 6, zeroY);
        ctx.fillText(`-${maxAbsDelta.toFixed(1)}s`, leftPad - 6, currentTopY + padY + innerH);
      } else if (plot.id === 'speed') {
        const minV = 40;
        const maxV = Math.max(
          280,
          Math.ceil(Math.max(refLap?.maxSpeedKmh ?? 260, userLap?.maxSpeedKmh ?? 260) / 20) * 20
        );

        // Midline grid
        const midY = currentTopY + padY + innerH / 2;
        ctx.strokeStyle = 'rgba(38, 38, 38, 0.8)';
        ctx.beginPath();
        ctx.moveTo(leftPad, midY);
        ctx.lineTo(width - rightPad, midY);
        ctx.stroke();

        // Reference Speed (dashed cyan)
        drawTrace(
          currentTopY,
          bandH,
          minV,
          maxV,
          (c) => c.ref?.speedKmh ?? null,
          (c) => c.ref?.segmentId ?? null,
          '#38BDF8',
          true,
          false,
          1.8
        );

        // User Speed (solid amber)
        drawTrace(
          currentTopY,
          bandH,
          minV,
          maxV,
          (c) => c.user?.speedKmh ?? null,
          (c) => c.user?.segmentId ?? null,
          '#F59E0B',
          false,
          false,
          2.0
        );

        // Corner labels T1..T8 along top of speed graph
        ctx.font = '600 9px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        for (const badge of extremaBadges) {
          if (badge.kind !== 'vmin') continue;
          if (badge.distanceM < viewStartM || badge.distanceM > viewEndM) continue;
          const bx = distanceMToX(badge.distanceM, width);
          ctx.fillStyle =
            badge.speedDeltaKmh !== null && badge.speedDeltaKmh < -1
              ? '#FDA4AF'
              : '#A3A3A3';
          ctx.fillText(badge.label, bx, currentTopY + 9);
        }

        // Y-axis labels
        ctx.fillStyle = '#737373';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${maxV}`, leftPad - 6, currentTopY + padY);
        ctx.fillText(`${Math.round((minV + maxV) / 2)}`, leftPad - 6, midY);
        ctx.fillText(`${minV}`, leftPad - 6, currentTopY + padY + innerH);
      } else if (plot.id === 'gear') {
        const minG = 0;
        const maxG = 7;

        // Reference Gear (dashed cyan, step-wise)
        drawTrace(
          currentTopY,
          bandH,
          minG,
          maxG,
          (c) => c.ref?.gear ?? null,
          (c) => c.ref?.segmentId ?? null,
          '#38BDF8',
          true,
          true,
          1.8
        );

        // User Gear (solid amber, step-wise)
        drawTrace(
          currentTopY,
          bandH,
          minG,
          maxG,
          (c) => c.user?.gear ?? null,
          (c) => c.user?.segmentId ?? null,
          '#F59E0B',
          false,
          true,
          2.0
        );

        ctx.fillStyle = '#737373';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('7', leftPad - 6, currentTopY + padY);
        ctx.fillText('4', leftPad - 6, currentTopY + padY + innerH * (3 / 7));
        ctx.fillText('1', leftPad - 6, currentTopY + padY + innerH * (6 / 7));
      } else if (plot.id === 'pedals') {
        // Reference Gas (dashed emerald), Brake (dashed rose), Clutch (dashed violet)
        drawTrace(
          currentTopY,
          bandH,
          0,
          1,
          (c) => c.ref?.gas ?? null,
          (c) => c.ref?.segmentId ?? null,
          'rgba(16, 185, 129, 0.65)',
          true,
          false,
          1.5
        );
        drawTrace(
          currentTopY,
          bandH,
          0,
          1,
          (c) => c.ref?.brake ?? null,
          (c) => c.ref?.segmentId ?? null,
          'rgba(244, 63, 94, 0.65)',
          true,
          false,
          1.5
        );
        drawTrace(
          currentTopY,
          bandH,
          0,
          1,
          (c) => c.ref?.clutch ?? null,
          (c) => c.ref?.segmentId ?? null,
          'rgba(168, 85, 247, 0.55)',
          true,
          false,
          1.3
        );

        // User Gas (solid emerald), Brake (solid rose), Clutch (solid violet)
        drawTrace(
          currentTopY,
          bandH,
          0,
          1,
          (c) => c.user?.gas ?? null,
          (c) => c.user?.segmentId ?? null,
          '#10B981',
          false,
          false,
          1.9
        );
        drawTrace(
          currentTopY,
          bandH,
          0,
          1,
          (c) => c.user?.brake ?? null,
          (c) => c.user?.segmentId ?? null,
          '#F43F5E',
          false,
          false,
          1.9
        );
        drawTrace(
          currentTopY,
          bandH,
          0,
          1,
          (c) => c.user?.clutch ?? null,
          (c) => c.user?.segmentId ?? null,
          '#A855F7',
          false,
          false,
          1.5
        );

        ctx.fillStyle = '#737373';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('100%', leftPad - 6, currentTopY + padY);
        ctx.fillText('50%', leftPad - 6, currentTopY + padY + innerH / 2);
        ctx.fillText('0%', leftPad - 6, currentTopY + padY + innerH);
      } else if (plot.id === 'steer') {
        const zeroY = currentTopY + padY + innerH / 2;
        ctx.strokeStyle = 'rgba(115, 115, 115, 0.3)';
        ctx.beginPath();
        ctx.moveTo(leftPad, zeroY);
        ctx.lineTo(width - rightPad, zeroY);
        ctx.stroke();

        drawTrace(
          currentTopY,
          bandH,
          -140,
          140,
          (c) => c.ref?.steer ?? null,
          (c) => c.ref?.segmentId ?? null,
          '#38BDF8',
          true,
          false,
          1.6
        );
        drawTrace(
          currentTopY,
          bandH,
          -140,
          140,
          (c) => c.user?.steer ?? null,
          (c) => c.user?.segmentId ?? null,
          '#F59E0B',
          false,
          false,
          1.8
        );

        ctx.fillStyle = '#737373';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('+140°', leftPad - 6, currentTopY + padY);
        ctx.fillText('0°', leftPad - 6, zeroY);
        ctx.fillText('-140°', leftPad - 6, currentTopY + padY + innerH);
      } else if (plot.id === 'wheels') {
        drawTrace(
          currentTopY,
          bandH,
          600,
          2400,
          (c) => avgFourWheelsLoadK(c.ref),
          (c) => c.ref?.segmentId ?? null,
          '#38BDF8',
          true,
          false,
          1.6
        );
        drawTrace(
          currentTopY,
          bandH,
          600,
          2400,
          (c) => avgFourWheelsLoadK(c.user),
          (c) => c.user?.segmentId ?? null,
          '#F59E0B',
          false,
          false,
          1.8
        );

        ctx.fillStyle = '#737373';
        ctx.font = '500 10px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('2400', leftPad - 6, currentTopY + padY);
        ctx.fillText('1500', leftPad - 6, currentTopY + padY + innerH / 2);
        ctx.fillText('600', leftPad - 6, currentTopY + padY + innerH);
      }

      currentTopY += bandH;
    }

    // Bottom X-axis (Distance in meters)
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, height - 31, width, 31);
    ctx.fillStyle = '#737373';
    ctx.font = '500 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let m = firstTickM; m <= viewEndM; m += gridStepM) {
      const x = distanceMToX(m, width);
      if (x >= leftPad + 15 && x <= width - rightPad - 15) {
        ctx.fillText(`${Math.round(m)} ${t.common.metersShort}`, x, height - 15);
      }
    }

    ctx.restore();
  }, [
    canvasWidth,
    activePlots,
    totalCanvasHeight,
    viewStartM,
    viewEndM,
    comparisonGrid,
    extremaBadges,
    refLap,
    userLap,
    distanceMToX,
    avgFourWheelsLoadK,
    t,
  ]);

  // =========================================================================
  // LAYER 2 (DYNAMIC OVERLAY CANVAS): Crosshair, Live Band Readouts & Drag Zoom
  // Ultra-fast redraw (<0.2ms) on cursorDistanceM / dragSelect updates
  // =========================================================================
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const width = canvasWidth;
    const height = totalCanvasHeight;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // 1. Drag-to-zoom selection highlight
    if (dragSelect) {
      const x0 = Math.min(dragSelect.startX, dragSelect.currentX);
      const x1 = Math.max(dragSelect.startX, dragSelect.currentX);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.strokeStyle = '#E5E5E5';
      ctx.lineWidth = 1;
      ctx.fillRect(x0, 0, x1 - x0, height - 32);
      ctx.strokeRect(x0, 0, x1 - x0, height - 32);
    }

    // 2. Synchronized Vertical Crosshair Cursor
    if (cursorDistanceM >= viewStartM && cursorDistanceM <= viewEndM) {
      const cx = distanceMToX(cursorDistanceM, width);
      ctx.strokeStyle = '#FAFAFA';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, 0);
      ctx.lineTo(cx, height - 32);
      ctx.stroke();

      // Distance badge at bottom of crosshair
      const badgeTxt = `${cursorDistanceM} ${t.common.metersShort}`;
      const bw = 54;
      ctx.fillStyle = '#F5F5F5';
      ctx.fillRect(cx - bw / 2, height - 27, bw, 18);
      ctx.fillStyle = '#000000';
      ctx.font = '700 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeTxt, cx, height - 18);
    }

    // 3. Band titles & live cursor value readouts in top-left of each band
    const dIdx = Math.max(0, Math.min(comparisonGrid.length - 1, Math.round(cursorDistanceM)));
    const cPt = comparisonGrid[dIdx];
    let currentTopY = 0;

    for (const plot of activePlots) {
      let liveReadout = '';

      if (plot.id === 'delta') {
        const dt = cPt?.deltaTimeS;
        liveReadout = dt != null ? `${dt > 0 ? '+' : ''}${dt.toFixed(3)} ${t.common.secondsShort}` : 'null';
      } else if (plot.id === 'speed') {
        const rv = cPt?.ref?.speedKmh;
        const uv = cPt?.user?.speedKmh;
        liveReadout = `[A] ${rv != null ? Math.round(rv) : 'null'} | [B] ${
          uv != null ? Math.round(uv) : 'null'
        } ${t.common.kmh}`;
      } else if (plot.id === 'gear') {
        const rg = cPt?.ref?.gear;
        const ug = cPt?.user?.gear;
        liveReadout = `[A] ${rg != null ? rg : 'null'} | [B] ${ug != null ? ug : 'null'}`;
      } else if (plot.id === 'pedals') {
        const ug = cPt?.user?.gas ?? cPt?.ref?.gas;
        const ub = cPt?.user?.brake ?? cPt?.ref?.brake;
        const uc = cPt?.user?.clutch ?? cPt?.ref?.clutch;
        liveReadout = `${t.telemetryStack.readoutGas}: ${ug != null ? Math.round(ug * 100) + '%' : 'null'} · ${t.telemetryStack.readoutBrake}: ${
          ub != null ? Math.round(ub * 100) + '%' : 'null'
        }${uc != null && uc > 0.01 ? ` · ${t.telemetryStack.readoutClutch}: ${Math.round(uc * 100)}%` : ''}`;
      } else if (plot.id === 'steer') {
        const rs = cPt?.ref?.steer;
        const us = cPt?.user?.steer;
        liveReadout = `[A] ${rs != null ? rs.toFixed(1) + '°' : 'null'} | [B] ${
          us != null ? us.toFixed(1) + '°' : 'null'
        }`;
      } else if (plot.id === 'wheels') {
        const rl = avgFourWheelsLoadK(cPt?.ref ?? null);
        const ul = avgFourWheelsLoadK(cPt?.user ?? null);
        liveReadout = `${t.telemetryStack.readoutAvgLoad}: [A] ${rl != null ? Math.round(rl) : 'null'} | [B] ${
          ul != null ? Math.round(ul) : 'null'
        } ${t.common.newtonsShort}`;
      }

      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      const titleW = ctx.measureText(plot.title).width;
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const readoutW = ctx.measureText(liveReadout).width;
      const readoutOffsetX = Math.max(105, Math.ceil(titleW) + 18);
      const pillW = readoutOffsetX + Math.ceil(readoutW) + 12;

      ctx.fillStyle = 'rgba(0, 0, 0, 0.88)';
      ctx.fillRect(leftPad + 6, currentTopY + 3, pillW, 16);

      ctx.font = '600 10px "Plus Jakarta Sans", sans-serif';
      ctx.fillStyle = '#A3A3A3';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(plot.title, leftPad + 10, currentTopY + 11);

      ctx.font = '600 10px "JetBrains Mono", monospace';
      ctx.fillStyle = '#F5F5F5';
      ctx.fillText(liveReadout, leftPad + 6 + readoutOffsetX, currentTopY + 11);

      currentTopY += plot.heightPx;
    }

    ctx.restore();
  }, [
    canvasWidth,
    activePlots,
    totalCanvasHeight,
    viewStartM,
    viewEndM,
    comparisonGrid,
    cursorDistanceM,
    distanceMToX,
    dragSelect,
    avgFourWheelsLoadK,
    t,
  ]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const distM = xToDistanceM(x, rect.width);
    setCursorDistanceM(distM);

    if (dragSelect) {
      setDragSelect((prev) => (prev ? { ...prev, currentX: x } : null));
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    setDragSelect({ startX: x, currentX: x });
  };

  const handleMouseUp = () => {
    if (!dragSelect) return;
    const canvas = overlayCanvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const pxSpan = Math.abs(dragSelect.currentX - dragSelect.startX);
      if (pxSpan > 18) {
        const d0 = xToDistanceM(Math.min(dragSelect.startX, dragSelect.currentX), rect.width);
        const d1 = xToDistanceM(Math.max(dragSelect.startX, dragSelect.currentX), rect.width);
        if (d1 - d0 >= 25) {
          setZoomRangeM([d0, d1]);
        }
      }
    }
    setDragSelect(null);
  };

  const handleWheelZoom = useCallback(
    (deltaY: number) => {
      const span = viewEndM - viewStartM;
      const factor = deltaY < 0 ? 0.8 : 1.25;
      const newSpan = Math.max(80, Math.min(trackLengthM, span * factor));
      if (newSpan >= trackLengthM - 5) {
        setZoomRangeM(null);
        return;
      }
      const centerRatio = (cursorDistanceM - viewStartM) / Math.max(1, span);
      let newStart = Math.round(cursorDistanceM - centerRatio * newSpan);
      let newEnd = Math.round(newStart + newSpan);
      if (newStart < 0) {
        newStart = 0;
        newEnd = Math.round(newSpan);
      }
      if (newEnd > trackLengthM) {
        newEnd = trackLengthM;
        newStart = Math.max(0, Math.round(trackLengthM - newSpan));
      }
      setZoomRangeM([newStart, newEnd]);
    },
    [viewStartM, viewEndM, trackLengthM, cursorDistanceM, setZoomRangeM]
  );

  // Attach native non-passive wheel listener so e.preventDefault() stops page scrolling
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      handleWheelZoom(e.deltaY);
    };

    canvas.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onNativeWheel);
    };
  }, [handleWheelZoom]);

  const s1End = Math.round(trackLengthM * 0.333);
  const s2End = Math.round(trackLengthM * 0.666);

  return (
    <div className="flex flex-col bg-black border border-neutral-800 rounded overflow-hidden">
      {/* Telemetry Stack Header & Sector Zoom Bar */}
      <div className="px-4 py-2.5 bg-[#070707] border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <h2 className="text-xs font-semibold text-neutral-100 whitespace-nowrap">
            {t.telemetryStack.title}
          </h2>
          <span className="text-xs text-neutral-500 font-mono truncate">
            {t.telemetryStack.subtitle}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          {/* Quick Sector Zoom Buttons */}
          <div className="flex items-center bg-black p-0.5 rounded border border-neutral-800 text-[11px] font-mono">
            <button
              type="button"
              onClick={() => setZoomRangeM(null)}
              className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                zoomRangeM === null
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              {t.telemetryStack.fullLap}
            </button>
            <button
              type="button"
              onClick={() => setZoomRangeM([0, s1End])}
              className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                zoomRangeM && zoomRangeM[0] === 0 && zoomRangeM[1] === s1End
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              S1
            </button>
            <button
              type="button"
              onClick={() => setZoomRangeM([s1End, s2End])}
              className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                zoomRangeM && zoomRangeM[0] === s1End && zoomRangeM[1] === s2End
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              S2
            </button>
            <button
              type="button"
              onClick={() => setZoomRangeM([s2End, trackLengthM])}
              className={`px-2 py-0.5 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                zoomRangeM && zoomRangeM[0] === s2End && zoomRangeM[1] === trackLengthM
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              S3
            </button>
          </div>

          {zoomRangeM !== null && (
            <button
              type="button"
              onClick={() => setZoomRangeM(null)}
              className="px-2 py-1 text-[11px] font-mono bg-neutral-900 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 rounded flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <ZoomOut className="w-3 h-3" />
              <span>
                {t.telemetryStack.resetZoom} ({viewStartM}–{viewEndM} {t.common.metersShort})
              </span>
            </button>
          )}

          {hasWheels && (
            <button
              type="button"
              onClick={() => setShowWheelNetcodeChannel(!showWheelNetcodeChannel)}
              className={`px-2 py-1 text-[11px] font-mono rounded border flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                showWheelNetcodeChannel
                  ? 'bg-neutral-800 border-neutral-600 text-white'
                  : 'bg-black border-neutral-800 text-neutral-500 hover:text-neutral-300'
              }`}
              title={t.telemetryStack.wheelsTitle}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>{t.telemetryStack.wheelsBtn}</span>
            </button>
          )}
        </div>
      </div>

      {/* Provenance notice when viewing wheel channels of a remote car */}
      {showWheelNetcodeChannel &&
        (refSession?.archive.manifest.provenance?.wheels === 'netcode' ||
          userSession?.archive.manifest.provenance?.wheels === 'netcode') && (
          <div className="px-4 py-1.5 bg-neutral-950 border-b border-neutral-800 text-[11px] font-mono text-neutral-400">
            {t.telemetryStack.netcodeNotice}
          </div>
        )}

      {/* Dual-Layer Synchronized Multi-Channel Canvas Stage */}
      <div
        ref={containerRef}
        style={{ height: `${totalCanvasHeight}px` }}
        className="relative w-full select-none overscroll-contain"
      >
        {/* Layer 1: Static Plot Traces & Grid */}
        <canvas
          ref={baseCanvasRef}
          style={{ height: `${totalCanvasHeight}px` }}
          className="w-full block pointer-events-none"
        />

        {/* Layer 2: Interactive Crosshair & Live Readouts Overlay */}
        <canvas
          ref={overlayCanvasRef}
          style={{ height: `${totalCanvasHeight}px` }}
          onMouseMove={handleMouseMove}
          onMouseDown={handleMouseDown}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setDragSelect(null)}
          className="absolute inset-0 w-full block cursor-crosshair"
        />
      </div>
    </div>
  );
};
