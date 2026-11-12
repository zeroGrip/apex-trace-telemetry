import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ZoomIn, ZoomOut, Maximize2, Minimize2, RotateCcw } from 'lucide-react';
import { useTelemetry, TrajectoryColorMode } from '../store/useTelemetry';
import { useI18n } from '../i18n/translations';
import { ResampledMeterPoint } from '../core/resampler';
import { PairedExtremumBadge } from '../core/extrema';

/**
 * Maps normalized speed [0..1] to a smooth thermal racing heatmap color:
 * Blue (slow apex) -> Cyan -> Green -> Yellow -> Red (top speed).
 */
function speedToHeatmapColor(speedKmh: number, minSpeed: number, maxSpeed: number): string {
  const span = Math.max(10, maxSpeed - minSpeed);
  const t = Math.max(0, Math.min(1, (speedKmh - minSpeed) / span));

  if (t < 0.25) {
    // Blue (#3B82F6) to Cyan (#06B6D4)
    const u = t / 0.25;
    const r = Math.round(59 + (6 - 59) * u);
    const g = Math.round(130 + (182 - 130) * u);
    const b = Math.round(246 + (212 - 246) * u);
    return `rgb(${r},${g},${b})`;
  } else if (t < 0.5) {
    // Cyan (#06B6D4) to Emerald (#10B981)
    const u = (t - 0.25) / 0.25;
    const r = Math.round(6 + (16 - 6) * u);
    const g = Math.round(182 + (185 - 182) * u);
    const b = Math.round(212 + (129 - 212) * u);
    return `rgb(${r},${g},${b})`;
  } else if (t < 0.78) {
    // Emerald (#10B981) to Amber/Yellow (#F59E0B)
    const u = (t - 0.5) / 0.28;
    const r = Math.round(16 + (245 - 16) * u);
    const g = Math.round(185 + (158 - 185) * u);
    const b = Math.round(129 + (11 - 129) * u);
    return `rgb(${r},${g},${b})`;
  } else {
    // Amber (#F59E0B) to Crimson Red (#EF4444)
    const u = (t - 0.78) / 0.22;
    const r = Math.round(245 + (239 - 245) * u);
    const g = Math.round(158 + (68 - 158) * u);
    const b = Math.round(11 + (68 - 11) * u);
    return `rgb(${r},${g},${b})`;
  }
}

/**
 * Maps pedal inputs (gas/brake) to color:
 * Green = Gas, Red = Brake, Yellow = Coasting
 */
function pedalsToColor(pt: ResampledMeterPoint): string {
  const gas = pt.gas ?? 0;
  const brake = pt.brake ?? 0;
  if (brake > 0.12) {
    return '#EF4444'; // Braking (Red)
  }
  if (gas > 0.18) {
    return '#10B981'; // Throttle (Green)
  }
  return '#FACC15'; // Coasting (Yellow)
}

interface BadgeHitBox {
  badge: PairedExtremumBadge;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const TrackCanvas: React.FC = () => {
  const {
    refSession,
    userSession,
    refLap,
    userLap,
    refGrid,
    userGrid,
    comparisonGrid,
    trackSurface,
    extremaBadges,
    cursorDistanceM,
    setCursorDistanceM,
    colorMode,
    setColorMode,
    showExtremaBadges,
    setShowExtremaBadges,
    showAsphaltBounds,
    setShowAsphaltBounds,
    isMapExpanded,
    setIsMapExpanded,
  } = useTelemetry();

  const { t } = useI18n();

  const containerRef = useRef<HTMLDivElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const badgeHitBoxesRef = useRef<BadgeHitBox[]>([]);

  // Track container dimensions for crisp dual-layer rendering
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({
    width: 600,
    height: 480,
  });

  // View transformation state (pan & zoom)
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; panX: number; panY: number }>({
    x: 0,
    y: 0,
    panX: 0,
    panY: 0,
  });

  const resetView = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Resize observer so both canvas layers stay crisp when window or layout resizes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const updateDimensions = () => {
      const rect = container.getBoundingClientRect();
      const width = Math.max(300, Math.floor(rect.width));
      const height = Math.max(320, Math.floor(rect.height));
      setCanvasSize((prev) =>
        prev.width !== width || prev.height !== height ? { width, height } : prev
      );
    };
    updateDimensions();
    const ro = new ResizeObserver(updateDimensions);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Calculate world-to-screen projection helper
  const getProjection = useCallback(
    (width: number, height: number) => {
      const bounds = trackSurface?.bounds ?? {
        minX: -120,
        maxX: 120,
        minZ: -120,
        maxZ: 120,
        width: 240,
        height: 240,
      };

      const pad = 54;
      const availW = Math.max(100, width - pad * 2);
      const availH = Math.max(100, height - pad * 2);

      const baseScale = Math.min(availW / bounds.width, availH / bounds.height);
      const scale = baseScale * zoom;

      const centerX = (bounds.minX + bounds.maxX) / 2;
      const centerZ = (bounds.minZ + bounds.maxZ) / 2;

      const toScreen = (wx: number, wz: number): [number, number] => {
        const sx = width / 2 + (wx - centerX) * scale + pan.x;
        const sy = height / 2 + (wz - centerZ) * scale + pan.y;
        return [sx, sy];
      };

      const toWorld = (sx: number, sy: number): [number, number] => {
        const wx = (sx - width / 2 - pan.x) / scale + centerX;
        const wz = (sy - height / 2 - pan.y) / scale + centerZ;
        return [wx, wz];
      };

      return { scale, toScreen, toWorld };
    },
    [trackSurface, zoom, pan]
  );

  // =========================================================================
  // BASE CANVAS (STATIC LAYER): Asphalt, Trajectories (Ref + User), Extrema Badges
  // Does NOT depend on cursorDistanceM -> never redraws when scrubbing cursor!
  // =========================================================================
  useEffect(() => {
    const canvas = baseCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvasSize;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear background (Pure OLED Black)
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, width, height);

    // Subtle monochrome engineering coordinate grid
    ctx.strokeStyle = 'rgba(38, 38, 38, 0.55)';
    ctx.lineWidth = 1;
    const gridStep = 48;
    ctx.beginPath();
    for (let gx = (pan.x % gridStep + gridStep) % gridStep; gx < width; gx += gridStep) {
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
    }
    for (let gy = (pan.y % gridStep + gridStep) % gridStep; gy < height; gy += gridStep) {
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
    }
    ctx.stroke();

    const { scale, toScreen } = getProjection(width, height);

    // =========================================================================
    // LAYER 1: Reconstructed Track Surface (Left & Right Asphalt Edges + Centerline)
    // =========================================================================
    if (trackSurface && trackSurface.nodes.length >= 2) {
      const nodes = trackSurface.nodes;

      if (showAsphaltBounds) {
        // Fill asphalt ribbon polygon between E_left(p) and E_right(p) in monochrome dark gray
        ctx.fillStyle = '#121212';
        ctx.beginPath();
        for (let i = 0; i < nodes.length; i++) {
          const [lx, ly] = toScreen(nodes[i].leftEdge.x, nodes[i].leftEdge.z);
          if (i === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        for (let i = nodes.length - 1; i >= 0; i--) {
          const [rx, ry] = toScreen(nodes[i].rightEdge.x, nodes[i].rightEdge.z);
          ctx.lineTo(rx, ry);
        }
        ctx.closePath();
        ctx.fill();

        // Draw left asphalt boundary E_left(p)
        ctx.strokeStyle = '#404040';
        ctx.lineWidth = Math.max(1.2, Math.min(2.5, scale * 0.35));
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let i = 0; i < nodes.length; i++) {
          const [lx, ly] = toScreen(nodes[i].leftEdge.x, nodes[i].leftEdge.z);
          if (i === 0) ctx.moveTo(lx, ly);
          else ctx.lineTo(lx, ly);
        }
        ctx.stroke();

        // Draw right asphalt boundary E_right(p)
        ctx.beginPath();
        for (let i = 0; i < nodes.length; i++) {
          const [rx, ry] = toScreen(nodes[i].rightEdge.x, nodes[i].rightEdge.z);
          if (i === 0) ctx.moveTo(rx, ry);
          else ctx.lineTo(rx, ry);
        }
        ctx.stroke();
      }

      // Thin axial centerline from track.json
      ctx.strokeStyle = 'rgba(163, 163, 163, 0.22)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        const [cx, cy] = toScreen(nodes[i].center.x, nodes[i].center.z);
        if (i === 0) ctx.moveTo(cx, cy);
        else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Start / Finish line perpendicular bar at progress = 0
      const sfNode = nodes[0];
      const [sflX, sflY] = toScreen(sfNode.leftEdge.x, sfNode.leftEdge.z);
      const [sfrX, sfrY] = toScreen(sfNode.rightEdge.x, sfNode.rightEdge.z);
      ctx.strokeStyle = '#FAFAFA';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sflX, sflY);
      ctx.lineTo(sfrX, sfrY);
      ctx.stroke();

      const [sfcX, sfcY] = toScreen(sfNode.center.x, sfNode.center.z);
      ctx.fillStyle = '#0A0A0A';
      ctx.strokeStyle = '#737373';
      ctx.lineWidth = 1;
      ctx.fillRect(sfcX - 18, sfcY - 22, 36, 14);
      ctx.strokeRect(sfcX - 18, sfcY - 22, 36, 14);
      ctx.fillStyle = '#FAFAFA';
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('S/F', sfcX, sfcY - 15);
    }

    // Determine min/max speed for heatmap color scale
    const minSpeed = Math.min(
      refLap?.minSpeedKmh ?? 65,
      userLap?.minSpeedKmh ?? 65
    );
    const maxSpeed = Math.max(
      refLap?.maxSpeedKmh ?? 260,
      userLap?.maxSpeedKmh ?? 260
    );

    // =========================================================================
    // LAYER 2: Reference Driver (Archive 1) — Dashed Trajectory Line
    // =========================================================================
    if (refGrid && refGrid.points.length > 0) {
      const pts = refGrid.points;
      const isSingleRefOnly = !userGrid;

      if (isSingleRefOnly) {
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 6]);
        for (let i = 1; i < pts.length; i++) {
          const p0 = pts[i - 1];
          const p1 = pts[i];
          if (
            p0.x === null ||
            p0.z === null ||
            p1.x === null ||
            p1.z === null ||
            p0.isResetGap ||
            p1.isResetGap ||
            p0.segmentId !== p1.segmentId
          ) {
            continue;
          }
          const [x0, y0] = toScreen(p0.x, p0.z);
          const [x1, y1] = toScreen(p1.x, p1.z);
          ctx.strokeStyle =
            colorMode === 'pedals'
              ? pedalsToColor(p1)
              : speedToHeatmapColor(p1.speedKmh ?? 120, minSpeed, maxSpeed);
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
        ctx.setLineDash([]);
      } else {
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = '#38BDF8';
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        let penDown = false;

        for (let i = 0; i < pts.length; i++) {
          const pt = pts[i];
          if (
            pt.x === null ||
            pt.z === null ||
            pt.isResetGap ||
            (i > 0 && pt.segmentId !== pts[i - 1].segmentId)
          ) {
            penDown = false;
            continue;
          }
          const [sx, sy] = toScreen(pt.x, pt.z);
          if (!penDown) {
            ctx.moveTo(sx, sy);
            penDown = true;
          } else {
            ctx.lineTo(sx, sy);
          }
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // =========================================================================
    // LAYER 3: User Driver (Archive 2) — Solid Bright Heatmap / Pedal Line
    // Explicitly breaks at {"k": "note", "m": "reset"} (isResetGap / segmentId change)
    // =========================================================================
    if (userGrid && userGrid.points.length > 0) {
      const pts = userGrid.points;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.setLineDash([]);

      for (let i = 1; i < pts.length; i++) {
        const p0 = pts[i - 1];
        const p1 = pts[i];

        if (
          p0.x === null ||
          p0.z === null ||
          p1.x === null ||
          p1.z === null ||
          p0.isResetGap ||
          p1.isResetGap ||
          p0.segmentId !== p1.segmentId
        ) {
          if (p0.x !== null && p0.z !== null && !p0.isResetGap && p1.isResetGap) {
            const [rx, ry] = toScreen(p0.x, p0.z);
            ctx.fillStyle = '#F43F5E';
            ctx.beginPath();
            ctx.arc(rx, ry, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.font = '700 10px "JetBrains Mono", monospace';
            ctx.fillStyle = '#FDA4AF';
            ctx.textAlign = 'left';
            ctx.fillText(t.trackCanvas.resetCanvasLabel, rx + 8, ry - 6);
          }
          continue;
        }

        const [x0, y0] = toScreen(p0.x, p0.z);
        const [x1, y1] = toScreen(p1.x, p1.z);

        if (colorMode === 'pedals') {
          ctx.strokeStyle = pedalsToColor(p1);
        } else if (colorMode === 'delta') {
          const comp = comparisonGrid[i];
          const prevComp = comparisonGrid[Math.max(0, i - 10)];
          const localRate =
            comp?.deltaTimeS !== null &&
            comp?.deltaTimeS !== undefined &&
            prevComp?.deltaTimeS !== null &&
            prevComp?.deltaTimeS !== undefined
              ? comp.deltaTimeS - prevComp.deltaTimeS
              : 0;
          ctx.strokeStyle =
            localRate > 0.008
              ? '#EF4444'
              : localRate < -0.008
              ? '#10B981'
              : '#E5E5E5';
        } else {
          ctx.strokeStyle = speedToHeatmapColor(p1.speedKmh ?? 120, minSpeed, maxSpeed);
        }

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }

    // =========================================================================
    // LAYER 4: Extrema Callout Badges (V_min and V_max)
    // =========================================================================
    const hitBoxes: BadgeHitBox[] = [];

    if (showExtremaBadges && extremaBadges.length > 0) {
      ctx.font = '600 10px "JetBrains Mono", monospace';

      for (let i = 0; i < extremaBadges.length; i++) {
        const b = extremaBadges[i];
        const [bx, by] = toScreen(b.x, b.z);

        const prefix = b.kind === 'vmin' ? `${b.label} Min:` : `${b.label} Max:`;
        let text = '';
        let isSlowerApex = false;

        if (b.userSpeedKmh !== null && b.refSpeedKmh !== null && userSession && refSession) {
          const delta = b.speedDeltaKmh ?? 0;
          const sign = delta > 0 ? `+${delta}` : `${delta}`;
          text = `${prefix} ${b.userSpeedKmh} | ${b.refSpeedKmh} ${t.common.kmh} (${sign})`;
          if (b.kind === 'vmin' && delta < -1) {
            isSlowerApex = true;
          }
        } else {
          const singleV = b.userSpeedKmh ?? b.refSpeedKmh ?? 0;
          text = `${prefix} ${singleV} ${t.common.kmh}`;
        }

        const dirX = bx >= width / 2 ? 1 : -1;
        const dirY = by >= height / 2 ? 1 : -1;
        const offsetX = dirX * (b.kind === 'vmin' ? 24 : 18);
        const offsetY = dirY * (b.kind === 'vmin' ? 22 : -20);

        const boxCenterX = bx + offsetX;
        const boxCenterY = by + offsetY;

        const textMetrics = ctx.measureText(text);
        const boxW = textMetrics.width + 12;
        const boxH = 19;
        const boxLeft = dirX > 0 ? boxCenterX : boxCenterX - boxW;
        const boxTop = boxCenterY - boxH / 2;

        ctx.strokeStyle = isSlowerApex
          ? 'rgba(244, 63, 94, 0.8)'
          : b.kind === 'vmin'
          ? 'rgba(56, 189, 248, 0.7)'
          : 'rgba(163, 163, 163, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(dirX > 0 ? boxLeft : boxLeft + boxW, boxCenterY);
        ctx.stroke();

        ctx.fillStyle = isSlowerApex
          ? '#F43F5E'
          : b.kind === 'vmin'
          ? '#38BDF8'
          : '#FACC15';
        ctx.beginPath();
        ctx.arc(bx, by, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = isSlowerApex
          ? 'rgba(35, 5, 14, 0.94)'
          : 'rgba(8, 8, 8, 0.94)';
        ctx.strokeStyle = isSlowerApex
          ? '#F43F5E'
          : b.kind === 'vmin'
          ? '#0284C7'
          : '#404040';
        ctx.lineWidth = 1;
        ctx.fillRect(boxLeft, boxTop, boxW, boxH);
        ctx.strokeRect(boxLeft, boxTop, boxW, boxH);

        ctx.fillStyle = isSlowerApex
          ? '#FECDD3'
          : b.kind === 'vmin'
          ? '#E0F2FE'
          : '#F5F5F5';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, boxLeft + 6, boxCenterY + 0.5);

        hitBoxes.push({
          badge: b,
          left: boxLeft,
          top: boxTop,
          right: boxLeft + boxW,
          bottom: boxTop + boxH,
        });
      }
    }
    badgeHitBoxesRef.current = hitBoxes;

    ctx.restore();
  }, [
    canvasSize,
    trackSurface,
    refGrid,
    userGrid,
    comparisonGrid,
    refLap,
    userLap,
    refSession,
    userSession,
    extremaBadges,
    colorMode,
    showExtremaBadges,
    showAsphaltBounds,
    getProjection,
    pan,
    t,
  ]);

  // =========================================================================
  // OVERLAY CANVAS (DYNAMIC LAYER 5): Synchronized Car Markers ('A' & 'B')
  // Redraws only two circles + labels on cursorDistanceM change (<0.1ms)
  // =========================================================================
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvasSize;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const { toScreen } = getProjection(width, height);
    const dIdx = Math.max(0, Math.min(comparisonGrid.length - 1, Math.round(cursorDistanceM)));
    const compAtCursor = comparisonGrid[dIdx];

    const drawCarMarker = (
      pt: ResampledMeterPoint | null | undefined,
      letter: 'A' | 'B',
      fillColor: string,
      ringColor: string
    ) => {
      if (!pt || pt.x === null || pt.z === null || pt.isResetGap) return;
      const [cx, cy] = toScreen(pt.x, pt.z);

      // Outer halo
      ctx.fillStyle = ringColor;
      ctx.beginPath();
      ctx.arc(cx, cy, 12, 0, Math.PI * 2);
      ctx.fill();

      // Solid marker circle
      ctx.fillStyle = fillColor;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Letter ('A' or 'B')
      ctx.fillStyle = '#000000';
      ctx.font = '800 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, cx, cy + 0.5);
    };

    // Draw Pilot A marker 'A' first, then Pilot B marker 'B' on top
    drawCarMarker(
      compAtCursor?.ref,
      'A',
      '#38BDF8',
      'rgba(56, 189, 248, 0.28)'
    );
    drawCarMarker(
      compAtCursor?.user,
      'B',
      '#F59E0B',
      'rgba(245, 158, 11, 0.32)'
    );

    ctx.restore();
  }, [canvasSize, comparisonGrid, cursorDistanceM, getProjection]);

  // Find closest track distance when user clicks or scrubs on the 2D map
  const snapCursorToMouse = useCallback(
    (clientX: number, clientY: number, checkBadgesFirst: boolean) => {
      const canvas = overlayCanvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;

      if (checkBadgesFirst) {
        for (const box of badgeHitBoxesRef.current) {
          if (sx >= box.left && sx <= box.right && sy >= box.top && sy <= box.bottom) {
            setCursorDistanceM(box.badge.distanceM);
            return;
          }
        }
      }

      const { toWorld } = getProjection(rect.width, rect.height);
      const [wx, wz] = toWorld(sx, sy);

      // Search closest point in userGrid, refGrid, or trackSurface
      let bestDistSq = Infinity;
      let bestMeter = cursorDistanceM;

      const primaryPoints = userGrid?.points ?? refGrid?.points ?? null;
      if (primaryPoints) {
        for (let d = 0; d < primaryPoints.length; d += 2) {
          const pt = primaryPoints[d];
          if (pt.x === null || pt.z === null || pt.isResetGap) continue;
          const dx = pt.x - wx;
          const dz = pt.z - wz;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestMeter = pt.distanceM;
          }
        }
      } else if (trackSurface) {
        for (const node of trackSurface.nodes) {
          const dx = node.center.x - wx;
          const dz = node.center.z - wz;
          const dSq = dx * dx + dz * dz;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            bestMeter = Math.round(node.distanceM);
          }
        }
      }

      if (bestDistSq < Infinity) {
        setCursorDistanceM(bestMeter);
      }
    },
    [getProjection, userGrid, refGrid, trackSurface, cursorDistanceM, setCursorDistanceM]
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({
      x: dragStartRef.current.panX + dx,
      y: dragStartRef.current.panY + dy,
    });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging) return;
    const movedDist = Math.hypot(
      e.clientX - dragStartRef.current.x,
      e.clientY - dragStartRef.current.y
    );
    setIsDragging(false);
    // If click without drag (< 5px), snap cursor to clicked track location or badge
    if (movedDist < 5) {
      snapCursorToMouse(e.clientX, e.clientY, true);
    }
  };

  // Attach native non-passive wheel listener so e.preventDefault() stops page scrolling on map zoom
  useEffect(() => {
    const canvas = overlayCanvasRef.current;
    if (!canvas) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      setZoom((prev) => Math.max(0.5, Math.min(12, prev * factor)));
    };

    canvas.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', onNativeWheel);
    };
  }, []);

  const dIdx = Math.max(0, Math.min(comparisonGrid.length - 1, Math.round(cursorDistanceM)));
  const currentComp = comparisonGrid[dIdx];
  const refPt = currentComp?.ref;
  const userPt = currentComp?.user;

  return (
    <div className="flex flex-col h-full bg-black border border-neutral-800 rounded overflow-hidden">
      {/* Map Header Controls */}
      <div className="px-4 py-2.5 bg-[#070707] border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-xs font-semibold text-neutral-100 truncate">
            {refSession?.archive.manifest.track.name ??
              userSession?.archive.manifest.track.name ??
              t.trackCanvas.circuitFallback}
          </h2>
          {trackSurface && (
            <span className="text-xs text-neutral-500 font-mono truncate">
              · {trackSurface.lengthM} {t.common.metersShort} · W≈
              {(trackSurface.medianHalfWidthM * 2).toFixed(1)} {t.common.metersShort}
            </span>
          )}
        </div>

        {/* Mode & Layer Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-black p-0.5 rounded border border-neutral-800">
            {(
              [
                { id: 'speed', label: t.trackCanvas.modeSpeed },
                { id: 'pedals', label: t.trackCanvas.modePedals },
                { id: 'delta', label: t.trackCanvas.modeDelta },
              ] as { id: TrajectoryColorMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setColorMode(m.id)}
                className={`px-2 py-1 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  colorMode === m.id
                    ? 'bg-neutral-800 text-white font-semibold'
                    : 'text-neutral-500 hover:text-neutral-200'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setShowExtremaBadges(!showExtremaBadges)}
            className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showExtremaBadges
                ? 'bg-neutral-800 border-neutral-600 text-neutral-100'
                : 'bg-black border-neutral-800 text-neutral-500 hover:text-neutral-300'
            }`}
            title={t.trackCanvas.vminVmaxTitle}
          >
            Vmin/Vmax
          </button>

          <button
            type="button"
            onClick={() => setShowAsphaltBounds(!showAsphaltBounds)}
            className={`px-2 py-1 text-[11px] font-mono rounded border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              showAsphaltBounds
                ? 'bg-neutral-800 border-neutral-600 text-neutral-100'
                : 'bg-black border-neutral-800 text-neutral-500 hover:text-neutral-300'
            }`}
            title={t.trackCanvas.surfaceTitle}
          >
            {t.trackCanvas.surfaceBtn}
          </button>
        </div>
      </div>

      {/* Dual-Layer Interactive Canvas Stage */}
      <div ref={containerRef} className="relative flex-1 min-h-[360px] select-none overscroll-contain">
        {/* Layer 1: Static Track Surface, Trajectories & Extrema Badges */}
        <canvas
          ref={baseCanvasRef}
          className="w-full h-full block pointer-events-none"
        />

        {/* Layer 2: Interactive Car Markers ('A' & 'B') Overlay */}
        <canvas
          ref={overlayCanvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setIsDragging(false)}
          className="absolute inset-0 w-full h-full block cursor-crosshair"
        />

        {/* Top-Left Telemetry Cursor Readout HUD */}
        <div className="absolute top-3 left-3 bg-black/90 border border-neutral-800 rounded p-2.5 pointer-events-none flex flex-col gap-1 text-xs font-mono">
          <div className="flex items-center gap-3 text-neutral-300">
            <span>
              {t.trackCanvas.hudDistance}{' '}
              <strong className="text-neutral-100">
                {cursorDistanceM} {t.common.metersShort}
              </strong>
            </span>
            {currentComp?.deltaTimeS !== null && currentComp?.deltaTimeS !== undefined && (
              <span
                className={
                  currentComp.deltaTimeS > 0 ? 'text-rose-400 font-semibold' : 'text-emerald-400 font-semibold'
                }
              >
                ΔT: {currentComp.deltaTimeS > 0 ? '+' : ''}
                {currentComp.deltaTimeS.toFixed(3)} {t.common.secondsShort}
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] pt-1 border-t border-neutral-900">
            <div className="text-cyan-400">
              [A] {refPt?.speedKmh != null ? `${Math.round(refPt.speedKmh)} ${t.common.kmh}` : '—'} ·{' '}
              {t.trackCanvas.hudGear}{' '}
              {refPt?.gear != null ? (refPt.gear === 0 ? 'N' : refPt.gear === -1 ? 'R' : refPt.gear) : '—'}
            </div>
            <div className="text-amber-400">
              [B] {userPt?.speedKmh != null ? `${Math.round(userPt.speedKmh)} ${t.common.kmh}` : '—'} ·{' '}
              {t.trackCanvas.hudGear}{' '}
              {userPt?.gear != null ? (userPt.gear === 0 ? 'N' : userPt.gear === -1 ? 'R' : userPt.gear) : '—'}
            </div>
            <div className="text-neutral-500">
              Lat: {refPt?.lateral != null ? refPt.lateral.toFixed(2) : 'null'}
            </div>
            <div className="text-neutral-500">
              Lat: {userPt?.lateral != null ? userPt.lateral.toFixed(2) : 'null'}
            </div>
          </div>
        </div>

        {/* Top-Right Pan/Zoom HUD Buttons */}
        <div className="absolute top-3 right-3 flex flex-col gap-1">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(12, z * 1.25))}
            className="p-1.5 bg-black/90 hover:bg-neutral-900 text-neutral-300 border border-neutral-800 rounded transition-colors cursor-pointer"
            title={t.trackCanvas.zoomInTitle}
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}
            className="p-1.5 bg-black/90 hover:bg-neutral-900 text-neutral-300 border border-neutral-800 rounded transition-colors cursor-pointer"
            title={t.trackCanvas.zoomOutTitle}
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setIsMapExpanded((prev) => !prev);
              resetView();
            }}
            className={`p-1.5 border rounded transition-colors cursor-pointer ${
              isMapExpanded
                ? 'bg-neutral-800 hover:bg-neutral-700 text-white border-neutral-500'
                : 'bg-black/90 hover:bg-neutral-900 text-neutral-300 border-neutral-800'
            }`}
            title={
              isMapExpanded
                ? t.trackCanvas.expandSplitTitle
                : t.trackCanvas.expandFullTitle
            }
          >
            {isMapExpanded ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>
          {(zoom !== 1 || pan.x !== 0 || pan.y !== 0) && (
            <button
              type="button"
              onClick={resetView}
              className="p-1.5 bg-black/90 hover:bg-neutral-900 text-neutral-300 border border-neutral-800 rounded transition-colors cursor-pointer"
              title={t.trackCanvas.resetViewTitle}
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Bottom Legend */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-2 bg-black/90 border border-neutral-800 rounded px-3 py-1.5 text-[11px] font-mono text-neutral-400 pointer-events-none">
          <div className="flex items-center gap-3">
            <span className="text-cyan-400">{t.trackCanvas.legendPilotA}</span>
            <span className="text-amber-400">{t.trackCanvas.legendPilotB}</span>
          </div>

          {colorMode === 'speed' && (
            <div className="flex items-center gap-1.5">
              <span>{t.trackCanvas.legendSlow}</span>
              <span className="w-20 h-2 rounded-sm bg-gradient-to-r from-blue-500 via-emerald-400 via-amber-400 to-red-500 inline-block" />
              <span>{t.trackCanvas.legendMax}</span>
            </div>
          )}
          {colorMode === 'pedals' && (
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">{t.trackCanvas.legendThrottle}</span>
              <span className="text-rose-400">{t.trackCanvas.legendBrake}</span>
              <span className="text-yellow-400">{t.trackCanvas.legendCoast}</span>
            </div>
          )}
          {colorMode === 'delta' && (
            <div className="flex items-center gap-2">
              <span className="text-emerald-400">{t.trackCanvas.legendGain}</span>
              <span className="text-rose-400">{t.trackCanvas.legendLoss}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
