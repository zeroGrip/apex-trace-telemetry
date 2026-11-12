import React, { useRef, useState, useEffect } from 'react';
import {
  Upload,
  ArrowLeftRight,
  Download,
  Trash2,
  AlertTriangle,
  FileArchive,
  ChevronDown,
  Check,
  Globe,
} from 'lucide-react';
import { useTelemetry, ActiveWorkspaceTab } from '../store/useTelemetry';
import { formatLapTime, ParsedLap } from '../core/lapSplitter';
import {
  useI18n,
  formatLocalizedLapLabel,
  localizeErrorMessage,
} from '../i18n/translations';

interface LapSelectorProps {
  laps: ParsedLap[];
  selectedLapNum: number;
  onSelect: (lapNum: number) => void;
}

const LapSelector: React.FC<LapSelectorProps> = ({
  laps,
  selectedLapNum,
  onSelect,
}) => {
  const { lang, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const activeLap = laps.find((l) => l.lapNumber === selectedLapNum) ?? laps[0];

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`h-7 px-2.5 bg-black border rounded text-xs font-mono text-neutral-100 flex items-center gap-2 transition-colors cursor-pointer ${
          open
            ? 'border-neutral-400 ring-1 ring-neutral-500/20'
            : 'border-neutral-800 hover:border-neutral-600 focus:border-neutral-400'
        }`}
      >
        <span className="truncate max-w-[180px]">
          {activeLap
            ? formatLocalizedLapLabel(activeLap, lang)
            : `${t.lapStatus.lapWord} ${selectedLapNum}`}
        </span>
        {activeLap && (
          <span className="text-[10px] text-neutral-500">
            {activeLap.frames.length} {t.common.framesShort}
          </span>
        )}
        <ChevronDown
          className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-150 shrink-0 ${
            open ? 'rotate-180 text-neutral-100' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 min-w-[230px] max-h-60 overflow-y-auto bg-[#050505] border border-neutral-700 rounded shadow-2xl z-50 py-1">
          {laps.map((l) => {
            const isSelected = l.lapNumber === selectedLapNum;
            return (
              <button
                key={l.lapNumber}
                type="button"
                onClick={() => {
                  onSelect(l.lapNumber);
                  setOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs font-mono flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-300 hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium">
                    {formatLocalizedLapLabel(l, lang)}
                  </span>
                  <span className="text-[10px] text-neutral-500 shrink-0">
                    ({l.frames.length} {t.common.framesShort})
                  </span>
                </div>
                {isSelected && <Check className="w-3.5 h-3.5 text-neutral-100 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const HeaderBar: React.FC = () => {
  const {
    refSession,
    userSession,
    refLap,
    userLap,
    activeTab,
    setActiveTab,
    loadZipIntoSlot,
    selectLapInSlot,
    swapSessions,
    clearSlot,
    downloadSlotAsApexZip,
    errorMessage,
    clearError,
  } = useTelemetry();

  const { lang, setLang, t } = useI18n();

  const refInputRef = useRef<HTMLInputElement>(null);
  const userInputRef = useRef<HTMLInputElement>(null);

  const [dragOverSlot, setDragOverSlot] = useState<'ref' | 'user' | null>(null);

  const handleFileChange = async (
    slot: 'ref' | 'user',
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      await loadZipIntoSlot(slot, file);
      e.target.value = '';
    }
  };

  const handleDragOver = (slot: 'ref' | 'user', e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverSlot !== slot) {
      setDragOverSlot(slot);
    }
  };

  const handleDragLeave = (slot: 'ref' | 'user', e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragOverSlot === slot) {
      setDragOverSlot(null);
    }
  };

  const handleDrop = async (slot: 'ref' | 'user', e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSlot(null);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // If user dropped 2 files at once, load first into target slot and second into the other slot
    await loadZipIntoSlot(slot, files[0]);
    if (files.length >= 2) {
      const otherSlot = slot === 'ref' ? 'user' : 'ref';
      await loadZipIntoSlot(otherSlot, files[1]);
    }
  };

  const navItems: { id: ActiveWorkspaceTab; label: string }[] = [
    { id: 'telemetry', label: t.header.tabTelemetry },
    { id: 'inspector', label: t.header.tabInspector },
  ];

  const hasAnySession = Boolean(refSession || userSession);
  const showSessionToolbar = hasAnySession && activeTab === 'telemetry';

  // Overall lap delta summary
  const lapDeltaMs =
    refLap?.durationMs && userLap?.durationMs
      ? userLap.durationMs - refLap.durationMs
      : null;

  return (
    <div className="border-b border-neutral-800 bg-black">
      {/* Top Bar */}
      <header
        className={`flex items-center justify-between gap-8 px-6 py-3 ${
          showSessionToolbar ? 'border-b border-neutral-900' : ''
        }`}
      >
        {/* Brand Title */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('telemetry');
          }}
          className="text-base font-bold tracking-tight text-neutral-100 whitespace-nowrap shrink-0"
        >
          Apex Trace
        </a>

        <div className="flex items-center gap-6">
          {/* Navigation links (shown only when at least one archive is loaded) */}
          {hasAnySession && (
            <nav className="flex items-center gap-6 text-xs font-medium text-neutral-400 overflow-x-auto">
              {navItems.map((item) => {
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setActiveTab(item.id)}
                    className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 cursor-pointer ${
                      isActive
                        ? 'text-white border-white font-semibold'
                        : 'text-neutral-500 border-transparent hover:text-neutral-200'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </nav>
          )}

          {/* Language Switcher (EN / RU) */}
          <div
            className="flex items-center bg-[#070707] p-0.5 rounded border border-neutral-800 text-[11px] font-mono shrink-0"
            title={t.header.langSwitchTitle}
          >
            <Globe className="w-3.5 h-3.5 text-neutral-500 ml-1.5 mr-1" />
            <button
              type="button"
              onClick={() => setLang('en')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                lang === 'en'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              EN
            </button>
            <button
              type="button"
              onClick={() => setLang('ru')}
              className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
                lang === 'ru'
                  ? 'bg-neutral-800 text-white font-semibold'
                  : 'text-neutral-500 hover:text-neutral-200'
              }`}
            >
              RU
            </button>
          </div>
        </div>
      </header>

      {/* Error banner if archive parsing failed */}
      {errorMessage && (
        <div className="px-6 py-2.5 bg-neutral-950 border-t border-neutral-800 flex items-center justify-between gap-4 text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{localizeErrorMessage(errorMessage, lang)}</span>
          </div>
          <button
            type="button"
            onClick={clearError}
            className="px-2.5 py-1 text-xs font-medium text-neutral-300 hover:text-white underline whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t.common.close}
          </button>
        </div>
      )}

      {/* Workspace Session Loader & Lap Comparison Toolbar (shown only on Telemetry tab when an archive is loaded) */}
      {showSessionToolbar && (
        <div className="px-6 py-3 bg-black grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          {/* Archive 1: Pilot A */}
          <div
            onDragOver={(e) => handleDragOver('ref', e)}
            onDragEnter={(e) => handleDragOver('ref', e)}
            onDragLeave={(e) => handleDragLeave('ref', e)}
            onDrop={(e) => handleDrop('ref', e)}
            className={`xl:col-span-5 rounded p-3 flex flex-col justify-between gap-2 transition-colors border ${
              dragOverSlot === 'ref'
                ? 'bg-neutral-900 border-neutral-400 border-dashed'
                : 'bg-[#070707] border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono font-semibold text-cyan-400 truncate">
                  [A] {refSession ? refSession.archive.manifest.target.driverName : t.common.pilotA}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  ref={refInputRef}
                  type="file"
                  accept=".zip,.apex.zip"
                  onChange={(e) => handleFileChange('ref', e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => refInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-200 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title={t.header.selectZipTitleA}
                >
                  <Upload className="w-3.5 h-3.5 text-neutral-400" />
                  <span>{t.header.selectZip}</span>
                </button>
                {refSession && (
                  <>
                    <button
                      type="button"
                      onClick={() => downloadSlotAsApexZip('ref')}
                      className="p-1 text-neutral-400 hover:text-neutral-100 bg-neutral-900 hover:bg-neutral-800 rounded border border-neutral-800 transition-colors cursor-pointer"
                      title={t.header.downloadZipTitle}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSlot('ref')}
                      className="p-1 text-neutral-400 hover:text-neutral-100 bg-neutral-900 hover:bg-neutral-800 rounded border border-neutral-800 transition-colors cursor-pointer"
                      title={t.header.clearSlotTitleA}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {refSession ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-neutral-900 min-h-[34px]">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 font-mono">
                  <span className="text-neutral-300">
                    {refSession.archive.manifest.target.carModel ?? t.common.unknownCar}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {refSession.archive.manifest.target.isRemote ? t.common.remote : t.common.local}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-neutral-500 whitespace-nowrap">
                    {t.header.lapLabel}
                  </span>
                  <LapSelector
                    laps={refSession.laps}
                    selectedLapNum={refSession.selectedLapNum}
                    onSelect={(lapNum) => selectLapInSlot('ref', lapNum)}
                  />
                </div>
              </div>
            ) : (
              <div
                onClick={() => refInputRef.current?.click()}
                className="text-xs text-neutral-500 py-1.5 px-2 rounded border border-dashed border-neutral-800 hover:border-neutral-600 hover:text-neutral-300 flex items-center gap-2 cursor-pointer transition-colors min-h-[34px]"
              >
                <FileArchive className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>{t.header.dropInlineA}</span>
              </div>
            )}
          </div>

          {/* Center Comparison Summary */}
          <div className="xl:col-span-2 flex flex-col justify-between gap-2 bg-[#070707] border border-neutral-800 rounded p-3">
            <div className="flex items-center justify-between w-full gap-2">
              <span className="text-xs text-neutral-400 font-medium whitespace-nowrap">
                {t.header.lapDelta}
              </span>
              <button
                type="button"
                onClick={swapSessions}
                disabled={!refSession && !userSession}
                className="px-2 py-1 text-xs font-medium text-neutral-300 bg-neutral-900 hover:bg-neutral-800 disabled:opacity-40 rounded border border-neutral-800 flex items-center gap-1 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title={t.header.swapTitle}
              >
                <ArrowLeftRight className="w-3 h-3 text-neutral-400" />
                <span>{t.header.swap}</span>
              </button>
            </div>

            <div className="w-full flex items-center justify-center pt-1.5 border-t border-neutral-900 min-h-[34px]">
              {lapDeltaMs !== null ? (
                <div
                  className={`text-base font-mono font-bold tabular-nums leading-none ${
                    lapDeltaMs > 0 ? 'text-rose-400' : 'text-emerald-400'
                  }`}
                >
                  {lapDeltaMs > 0 ? '+' : ''}
                  {(lapDeltaMs / 1000).toFixed(3)} {t.common.secondsShort}
                </div>
              ) : (
                <div className="text-sm font-mono text-neutral-400 tabular-nums leading-none">
                  {refLap
                    ? formatLapTime(refLap.durationMs)
                    : userLap
                    ? formatLapTime(userLap.durationMs)
                    : t.header.waitingArchive}
                </div>
              )}
            </div>
          </div>

          {/* Archive 2: Pilot B */}
          <div
            onDragOver={(e) => handleDragOver('user', e)}
            onDragEnter={(e) => handleDragOver('user', e)}
            onDragLeave={(e) => handleDragLeave('user', e)}
            onDrop={(e) => handleDrop('user', e)}
            className={`xl:col-span-5 rounded p-3 flex flex-col justify-between gap-2 transition-colors border ${
              dragOverSlot === 'user'
                ? 'bg-neutral-900 border-neutral-400 border-dashed'
                : 'bg-[#070707] border-neutral-800'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-mono font-semibold text-amber-400 truncate">
                  [B] {userSession ? userSession.archive.manifest.target.driverName : t.common.pilotB}
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  ref={userInputRef}
                  type="file"
                  accept=".zip,.apex.zip"
                  onChange={(e) => handleFileChange('user', e)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => userInputRef.current?.click()}
                  className="px-2.5 py-1 text-xs font-medium text-neutral-200 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title={t.header.selectZipTitleB}
                >
                  <Upload className="w-3.5 h-3.5 text-neutral-400" />
                  <span>{t.header.selectZip}</span>
                </button>
                {userSession && (
                  <>
                    <button
                      type="button"
                      onClick={() => downloadSlotAsApexZip('user')}
                      className="p-1 text-neutral-400 hover:text-neutral-100 bg-neutral-900 hover:bg-neutral-800 rounded border border-neutral-800 transition-colors cursor-pointer"
                      title={t.header.downloadZipTitle}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => clearSlot('user')}
                      className="p-1 text-neutral-400 hover:text-neutral-100 bg-neutral-900 hover:bg-neutral-800 rounded border border-neutral-800 transition-colors cursor-pointer"
                      title={t.header.clearSlotTitleB}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {userSession ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-neutral-900 min-h-[34px]">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500 font-mono">
                  <span className="text-neutral-300">
                    {userSession.archive.manifest.target.carModel ?? t.common.unknownCar}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {userSession.archive.manifest.target.isRemote ? t.common.remote : t.common.local}
                  </span>
                  {userLap?.hasReset && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className="text-rose-400"
                        title={t.header.resetTooltip}
                      >
                        ✖ note: reset ({userLap.resetCount})
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-neutral-500 whitespace-nowrap">
                    {t.header.lapLabel}
                  </span>
                  <LapSelector
                    laps={userSession.laps}
                    selectedLapNum={userSession.selectedLapNum}
                    onSelect={(lapNum) => selectLapInSlot('user', lapNum)}
                  />
                </div>
              </div>
            ) : (
              <div
                onClick={() => userInputRef.current?.click()}
                className="text-xs text-neutral-500 py-1.5 px-2 rounded border border-dashed border-neutral-800 hover:border-neutral-600 hover:text-neutral-300 flex items-center gap-2 cursor-pointer transition-colors min-h-[34px]"
              >
                <FileArchive className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
                <span>{t.header.dropInlineB}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
