import React, { useState } from 'react';
import { useTelemetry } from '../store/useTelemetry';
import { useI18n, localizeParserWarning } from '../i18n/translations';

export const ArchiveInspector: React.FC = () => {
  const {
    refSession,
    userSession,
    trackSurface,
  } = useTelemetry();

  const { lang, t } = useI18n();

  const [selectedSlot, setSelectedSlot] = useState<'ref' | 'user'>('ref');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'frame' | 'wheel' | 'missing'>('all');

  const effectiveSlot: 'ref' | 'user' =
    selectedSlot === 'ref'
      ? refSession
        ? 'ref'
        : 'user'
      : userSession
      ? 'user'
      : 'ref';

  const activeSession = effectiveSlot === 'ref' ? refSession : userSession;

  if (!activeSession) {
    return (
      <div className="p-8 bg-black border border-neutral-800 rounded text-center text-xs text-neutral-500 font-mono">
        {t.inspector.empty}
      </div>
    );
  }

  const { archive } = activeSession;
  const coverage = archive.computedCoverage;

  const filteredCoverage = coverage.filter((c) => {
    if (scopeFilter === 'frame') return c.scope === 'frame';
    if (scopeFilter === 'wheel') return c.scope === 'wheel';
    if (scopeFilter === 'missing') return c.present < c.total;
    return true;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* Top Header Card with Archive Selector */}
      <div className="lg:col-span-12 bg-black border border-neutral-800 rounded p-4 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-neutral-100">
            {t.inspector.titlePrefix}
            {archive.manifest.schema})
          </h2>
          <p className="text-xs text-neutral-500 font-mono mt-0.5">
            {t.inspector.fileLabel} <span className="text-neutral-200">{archive.fileName}</span> ·{' '}
            {t.inspector.sessionLabel} {archive.manifest.sessionId} · {t.inspector.recordedLabel}{' '}
            {archive.manifest.startedUtc} · {t.inspector.chunksLabel}{' '}
            {archive.chunkNames.join(', ')}
          </p>
        </div>

        <div className="flex items-center bg-black p-0.5 rounded border border-neutral-800 text-xs font-mono">
          <button
            type="button"
            onClick={() => setSelectedSlot('ref')}
            disabled={!refSession}
            className={`px-3 py-1 rounded transition-colors cursor-pointer disabled:opacity-40 ${
              effectiveSlot === 'ref'
                ? 'bg-neutral-800 text-cyan-400 font-semibold'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            [A] {t.common.pilotAShort}{' '}
            {refSession ? `(${refSession.archive.manifest.target.driverName})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setSelectedSlot('user')}
            disabled={!userSession}
            className={`px-3 py-1 rounded transition-colors cursor-pointer disabled:opacity-40 ${
              effectiveSlot === 'user'
                ? 'bg-neutral-800 text-amber-400 font-semibold'
                : 'text-neutral-500 hover:text-neutral-200'
            }`}
          >
            [B] {t.common.pilotBShort}{' '}
            {userSession ? `(${userSession.archive.manifest.target.driverName})` : ''}
          </button>
        </div>
      </div>

      {/* Left Column: Manifest & Track Reconstruction Metadata + Raw JSON */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        <div className="bg-black border border-neutral-800 rounded overflow-hidden">
          <div className="px-4 py-2.5 bg-[#070707] border-b border-neutral-800 text-xs font-semibold text-neutral-200">
            {t.inspector.metaHeader}
          </div>
          <div className="p-4 flex flex-col gap-3 text-xs font-mono">
            <div className="grid grid-cols-2 gap-2 border-b border-neutral-900 pb-3">
              <div className="text-neutral-500">{t.inspector.driverLabel}</div>
              <div className="text-neutral-100 font-semibold">{archive.manifest.target.driverName}</div>
              <div className="text-neutral-500">{t.inspector.carLabel}</div>
              <div className="text-neutral-200">{archive.manifest.target.carModel ?? 'null'}</div>
              <div className="text-neutral-500">{t.inspector.remoteLabel}</div>
              <div className="text-neutral-200">
                {String(archive.manifest.target.isRemote)}
              </div>
              <div className="text-neutral-500">{t.inspector.provenanceLabel}</div>
              <div className="text-neutral-200">{archive.manifest.provenance?.wheels ?? 'reported'}</div>
              <div className="text-neutral-500">{t.inspector.trackLabel}</div>
              <div className="text-neutral-200">{archive.manifest.track.name ?? archive.manifest.track.id}</div>
              <div className="text-neutral-500">{t.inspector.lengthLabel}</div>
              <div className="text-neutral-200">
                {archive.manifest.track.lengthM ?? 'null'} {t.common.metersShort}
              </div>
              <div className="text-neutral-500">{t.inspector.splineLabel}</div>
              <div className="text-neutral-200">
                {String(archive.manifest.track.spline)} ({archive.manifest.track.splineSource ?? '—'})
              </div>
            </div>

            {trackSurface && (
              <div className="grid grid-cols-2 gap-2">
                <div className="text-neutral-500">{t.inspector.algoLabel}</div>
                <div className="text-neutral-200">{trackSurface.source}</div>
                <div className="text-neutral-500">{t.inspector.samplesLabel}</div>
                <div className="text-neutral-200">
                  {trackSurface.measuredSamplesCount} {t.common.framesFull}
                </div>
                <div className="text-neutral-500">{t.inspector.halfWidthLabel}</div>
                <div className="text-neutral-200">
                  {trackSurface.medianHalfWidthM.toFixed(2)} {t.common.metersShort} (
                  {t.inspector.widthApprox}{' '}
                  {(trackSurface.medianHalfWidthM * 2).toFixed(1)} {t.common.metersShort})
                </div>
              </div>
            )}

            {archive.warnings.length > 0 && (
              <div className="mt-2 p-3 bg-neutral-950 border border-neutral-800 rounded text-neutral-300 flex flex-col gap-1">
                <div className="font-semibold text-neutral-100">{t.inspector.warningsHeader}</div>
                {archive.warnings.map((w, i) => (
                  <div key={i}>• {localizeParserWarning(w, lang)}</div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Raw JSON Viewer for manifest.json & optional dump_car.json */}
        <div className="bg-black border border-neutral-800 rounded overflow-hidden">
          <div className="px-4 py-2.5 bg-[#070707] border-b border-neutral-800 text-xs font-semibold text-neutral-200">
            {t.inspector.rawJsonHeaderPrefix}
            {archive.dumpCar ? t.inspector.rawJsonHeaderAndDump : ''}
          </div>
          <pre className="p-4 text-[11px] font-mono text-neutral-300 max-h-[420px] overflow-auto">
            {JSON.stringify(
              {
                manifest: archive.manifest,
                summary: archive.summary ?? 'ABSENT (Unclean Stop)',
                ...(archive.dumpCar ? { dump_car: archive.dumpCar } : {}),
              },
              null,
              2
            )}
          </pre>
        </div>
      </div>

      {/* Right Column: Channel Coverage Matrix */}
      <div className="lg:col-span-7 flex flex-col gap-4">
        <div className="bg-black border border-neutral-800 rounded overflow-hidden">
          <div className="px-4 py-3 bg-[#070707] border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-xs font-semibold text-neutral-100">
                {t.inspector.coverageHeader}
              </h3>
              <p className="text-[11px] text-neutral-500 font-mono">
                {t.inspector.sourceLabel}{' '}
                <span className="text-neutral-300">
                  {archive.hasCleanSummary ? t.inspector.sourceSummary : t.inspector.sourceRecomputed}
                </span>{' '}
                · {t.inspector.totalFramesLabel}{' '}
                <span className="text-neutral-200">{archive.frames.length}</span>
              </p>
            </div>

            <div className="flex items-center bg-black p-0.5 rounded border border-neutral-800 text-xs font-mono">
              {(
                [
                  { id: 'all', label: t.inspector.filterAll },
                  { id: 'frame', label: t.inspector.filterFrame },
                  { id: 'wheel', label: t.inspector.filterWheel },
                  { id: 'missing', label: t.inspector.filterMissing },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setScopeFilter(f.id)}
                  className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                    scopeFilter === f.id
                      ? 'bg-neutral-800 text-white font-semibold'
                      : 'text-neutral-500 hover:text-neutral-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-mono tabular-nums">
              <thead>
                <tr className="border-b border-neutral-800 bg-[#050505] text-neutral-400">
                  <th className="py-2 px-4 font-medium">{t.inspector.colChannelId}</th>
                  <th className="py-2 px-4 font-medium">{t.inspector.colScope}</th>
                  <th className="py-2 px-4 font-medium text-right">{t.inspector.colPresent}</th>
                  <th className="py-2 px-4 font-medium text-right">{t.inspector.colTotal}</th>
                  <th className="py-2 px-4 font-medium text-right">{t.inspector.colCoverage}</th>
                  <th className="py-2 px-4 font-medium">{t.inspector.colStatus}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-900">
                {filteredCoverage.map((row) => {
                  const pct = row.total > 0 ? (row.present / row.total) * 100 : 0;
                  const isZero = row.present === 0;
                  const isNetcodeWheel =
                    row.scope === 'wheel' && archive.manifest.provenance?.wheels === 'netcode';

                  return (
                    <tr key={row.id} className="hover:bg-neutral-950">
                      <td className="py-2 px-4 font-semibold text-neutral-200">{row.id}</td>
                      <td className="py-2 px-4 text-neutral-500">{row.scope}</td>
                      <td
                        className={`py-2 px-4 text-right ${
                          isZero ? 'text-neutral-500' : 'text-neutral-200'
                        }`}
                      >
                        {row.present}
                      </td>
                      <td className="py-2 px-4 text-right text-neutral-500">{row.total}</td>
                      <td className="py-2 px-4 text-right">
                        <span
                          className={
                            isZero
                              ? 'text-neutral-500'
                              : pct < 100
                              ? 'text-neutral-300'
                              : 'text-neutral-100 font-semibold'
                          }
                        >
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-2 px-4 text-neutral-400">
                        {isZero
                          ? t.inspector.statusNull
                          : isNetcodeWheel
                          ? t.inspector.statusNetcode
                          : t.inspector.statusRecorded}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
