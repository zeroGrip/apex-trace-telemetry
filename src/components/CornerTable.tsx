import React, { useState } from 'react';
import { Crosshair, ZoomIn } from 'lucide-react';
import { useTelemetry } from '../store/useTelemetry';
import { useI18n } from '../i18n/translations';
import { PairedExtremumBadge } from '../core/extrema';

export const CornerTable: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const {
    extremaBadges,
    cursorDistanceM,
    setCursorDistanceM,
    setZoomRangeM,
    setActiveTab,
    trackLengthM,
  } = useTelemetry();

  const { t } = useI18n();

  const [filterKind, setFilterKind] = useState<'all' | 'vmin' | 'vmax'>('vmin');

  const filtered = extremaBadges.filter((b) =>
    filterKind === 'all' ? true : b.kind === filterKind
  );

  const handleInspectOnMap = (badge: PairedExtremumBadge, zoomIn: boolean) => {
    setCursorDistanceM(badge.distanceM);
    if (zoomIn) {
      const start = Math.max(0, badge.distanceM - 200);
      const end = Math.min(trackLengthM, badge.distanceM + 200);
      setZoomRangeM([start, end]);
      setActiveTab('telemetry');
    }
  };

  return (
    <div className="bg-black border border-neutral-800 rounded overflow-hidden flex flex-col">
      <div className="px-4 py-2.5 bg-[#070707] border-b border-neutral-800 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-semibold text-neutral-100">
            {t.cornerTable.title}
          </h3>
          <span className="text-xs text-neutral-500 font-mono">
            {t.cornerTable.subtitle}
          </span>
        </div>

        <div className="flex items-center bg-black p-0.5 rounded border border-neutral-800 text-[11px] font-mono">
          <button
            type="button"
            onClick={() => setFilterKind('vmin')}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterKind === 'vmin'
                ? 'bg-neutral-800 text-white font-semibold'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.cornerTable.filterVmin}
          </button>
          <button
            type="button"
            onClick={() => setFilterKind('vmax')}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterKind === 'vmax'
                ? 'bg-neutral-800 text-white font-semibold'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.cornerTable.filterVmax}
          </button>
          <button
            type="button"
            onClick={() => setFilterKind('all')}
            className={`px-2.5 py-1 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterKind === 'all'
                ? 'bg-neutral-800 text-white font-semibold'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            {t.cornerTable.filterAll} ({extremaBadges.length})
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-6 text-center text-xs text-neutral-500 font-mono">
          {t.cornerTable.empty}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
            <thead>
              <tr className="border-b border-neutral-800 bg-[#050505] text-[11px] text-neutral-400">
                <th className="py-2 px-3 font-medium">{t.cornerTable.colPoint}</th>
                <th className="py-2 px-3 font-medium text-right">{t.cornerTable.colDistance}</th>
                <th className="py-2 px-3 font-medium text-right">{t.cornerTable.colPilotA}</th>
                <th className="py-2 px-3 font-medium text-right">{t.cornerTable.colPilotB}</th>
                <th className="py-2 px-3 font-medium text-right">{t.cornerTable.colSpeedDelta}</th>
                <th className="py-2 px-3 font-medium text-center">{t.cornerTable.colGear}</th>
                {!compact && (
                  <th className="py-2 px-3 font-medium text-right">{t.cornerTable.colBrakePoint}</th>
                )}
                <th className="py-2 px-3 font-medium text-right">{t.cornerTable.colTimeLoss}</th>
                <th className="py-2 px-3 font-medium text-right">{t.cornerTable.colAction}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-900">
              {filtered.map((b) => {
                const isSelected = Math.abs(cursorDistanceM - b.distanceM) < 35;
                const isSlower = b.speedDeltaKmh !== null && b.speedDeltaKmh < 0;
                const gearMismatch =
                  b.refGear !== null && b.userGear !== null && b.refGear !== b.userGear;
                const brakeDiff =
                  b.refBrakeDistanceM !== null && b.userBrakeDistanceM !== null
                    ? b.userBrakeDistanceM - b.refBrakeDistanceM
                    : null;

                return (
                  <tr
                    key={b.id}
                    onClick={() => handleInspectOnMap(b, false)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-neutral-900 text-neutral-100'
                        : 'hover:bg-neutral-950 text-neutral-300'
                    }`}
                  >
                    <td className="py-2 px-3 font-semibold">
                      <span className="text-neutral-100 mr-1.5">
                        {b.label}
                      </span>
                      <span className="text-neutral-500 font-normal">
                        {b.kind === 'vmin' ? t.cornerTable.typeApex : t.cornerTable.typeStraight}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right text-neutral-300">
                      {b.distanceM} {t.common.metersShort}
                    </td>
                    <td className="py-2 px-3 text-right text-cyan-300">
                      {b.refSpeedKmh !== null ? `${b.refSpeedKmh} ${t.common.kmh}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right text-amber-300">
                      {b.userSpeedKmh !== null ? `${b.userSpeedKmh} ${t.common.kmh}` : '—'}
                    </td>
                    <td
                      className={`py-2 px-3 text-right font-semibold ${
                        b.speedDeltaKmh === null
                          ? 'text-neutral-600'
                          : isSlower
                          ? 'text-rose-400'
                          : b.speedDeltaKmh > 0
                          ? 'text-emerald-400'
                          : 'text-neutral-300'
                      }`}
                    >
                      {b.speedDeltaKmh !== null
                        ? `${b.speedDeltaKmh > 0 ? '+' : ''}${b.speedDeltaKmh} ${t.common.kmh}`
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className={gearMismatch ? 'text-amber-300 font-semibold' : 'text-neutral-300'}>
                        {b.refGear ?? '—'} | {b.userGear ?? '—'}
                      </span>
                    </td>
                    {!compact && (
                      <td className="py-2 px-3 text-right text-neutral-300">
                        {b.kind === 'vmin' &&
                        (b.refBrakeDistanceM !== null || b.userBrakeDistanceM !== null) ? (
                          <span>
                            {b.refBrakeDistanceM ?? '—'} {t.common.metersShort} |{' '}
                            {b.userBrakeDistanceM ?? '—'} {t.common.metersShort}
                            {brakeDiff !== null && (
                              <span
                                className={`ml-1.5 ${
                                  brakeDiff < -3 ? 'text-amber-400' : 'text-neutral-500'
                                }`}
                              >
                                ({brakeDiff > 0 ? `+${brakeDiff}` : brakeDiff} {t.common.metersShort})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>
                    )}
                    <td
                      className={`py-2 px-3 text-right font-semibold ${
                        b.cornerTimeLossS === null
                          ? 'text-neutral-600'
                          : b.cornerTimeLossS > 0.02
                          ? 'text-rose-400'
                          : b.cornerTimeLossS < -0.02
                          ? 'text-emerald-400'
                          : 'text-neutral-300'
                      }`}
                    >
                      {b.cornerTimeLossS !== null
                        ? `${b.cornerTimeLossS > 0 ? '+' : ''}${b.cornerTimeLossS.toFixed(3)} ${t.common.secondsShort}`
                        : '—'}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectOnMap(b, false);
                          }}
                          className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                          title={t.cornerTable.actionFocusTitle}
                        >
                          <Crosshair className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInspectOnMap(b, true);
                          }}
                          className="p-1 text-neutral-400 hover:text-white rounded hover:bg-neutral-800 transition-colors cursor-pointer"
                          title={t.cornerTable.actionZoomTitle}
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
