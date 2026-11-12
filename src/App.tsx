/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState } from 'react';
import { Upload, FileArchive } from 'lucide-react';
import { TelemetryProvider, useTelemetry } from './store/useTelemetry';
import { I18nProvider, useI18n } from './i18n/translations';
import { HeaderBar } from './components/HeaderBar';
import { TrackCanvas } from './components/TrackCanvas';
import { TelemetryStack } from './components/TelemetryStack';
import { CornerTable } from './components/CornerTable';
import { ArchiveInspector } from './components/ArchiveInspector';

const EmptyDropWorkspace: React.FC = () => {
  const { loadZipIntoSlot, isLoading } = useTelemetry();
  const { t } = useI18n();
  const [activeZone, setActiveZone] = useState<'main' | 'ref' | 'user' | null>(null);

  const refInputRef = useRef<HTMLInputElement>(null);
  const userInputRef = useRef<HTMLInputElement>(null);

  const handleDropFiles = async (
    target: 'auto' | 'ref' | 'user',
    e: React.DragEvent<HTMLDivElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveZone(null);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    if (files.length >= 2) {
      await loadZipIntoSlot('ref', files[0]);
      await loadZipIntoSlot('user', files[1]);
      return;
    }

    const slot = target === 'user' ? 'user' : 'ref';
    await loadZipIntoSlot(slot, files[0]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!activeZone) setActiveZone('main');
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setActiveZone(null);
      }}
      onDrop={(e) => handleDropFiles('auto', e)}
      className="flex-1 flex flex-col items-center justify-center p-6"
    >
      <div
        className={`w-full max-w-4xl rounded border transition-colors p-8 flex flex-col items-center text-center gap-6 ${
          activeZone === 'main'
            ? 'bg-neutral-900/60 border-neutral-400 border-dashed'
            : 'bg-[#050505] border-neutral-800'
        }`}
      >
        <div className="w-12 h-12 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-200">
          <FileArchive className="w-6 h-6" />
        </div>

        <div className="flex flex-col gap-2 max-w-xl">
          <h1 className="text-xl font-semibold text-neutral-100">
            {t.dropWorkspace.title}
          </h1>
          <p className="text-xs text-neutral-400 leading-relaxed">
            {t.dropWorkspace.subtitlePart1}
            <code className="text-neutral-200 font-mono">.apex.zip</code>
            {t.dropWorkspace.subtitlePart2}
            <code className="text-neutral-200 font-mono">fflate</code>
            {t.dropWorkspace.subtitlePart3}
          </p>
        </div>

        {/* Dual Drop Targets for Archive 1 (Reference) and Archive 2 (User) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full mt-2">
          {/* Dropzone 1: Pilot A */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveZone('ref');
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveZone(null);
            }}
            onDrop={(e) => handleDropFiles('ref', e)}
            onClick={() => refInputRef.current?.click()}
            className={`p-6 rounded border border-dashed transition-colors flex flex-col items-center justify-center gap-3 cursor-pointer ${
              activeZone === 'ref'
                ? 'bg-neutral-900 border-neutral-300'
                : 'bg-[#0A0A0A] border-neutral-800 hover:border-neutral-500 hover:bg-neutral-900/60'
            }`}
          >
            <input
              ref={refInputRef}
              type="file"
              accept=".zip,.apex.zip"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  await loadZipIntoSlot('ref', f);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
            <Upload className="w-5 h-5 text-neutral-300" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-mono font-semibold text-cyan-400">
                [A] {t.common.pilotA}
              </span>
              <span className="text-xs text-neutral-400">
                {t.dropWorkspace.dropOrClick}
              </span>
            </div>
          </div>

          {/* Dropzone 2: Pilot B */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveZone('user');
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setActiveZone(null);
            }}
            onDrop={(e) => handleDropFiles('user', e)}
            onClick={() => userInputRef.current?.click()}
            className={`p-6 rounded border border-dashed transition-colors flex flex-col items-center justify-center gap-3 cursor-pointer ${
              activeZone === 'user'
                ? 'bg-neutral-900 border-neutral-300'
                : 'bg-[#0A0A0A] border-neutral-800 hover:border-neutral-500 hover:bg-neutral-900/60'
            }`}
          >
            <input
              ref={userInputRef}
              type="file"
              accept=".zip,.apex.zip"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) {
                  await loadZipIntoSlot('user', f);
                  e.target.value = '';
                }
              }}
              className="hidden"
            />
            <Upload className="w-5 h-5 text-neutral-300" />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-mono font-semibold text-amber-400">
                [B] {t.common.pilotB}
              </span>
              <span className="text-xs text-neutral-400">
                {t.dropWorkspace.dropOrClick}
              </span>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="text-xs font-mono text-neutral-300">
            {t.dropWorkspace.unpacking}
          </div>
        )}
      </div>
    </div>
  );
};

const WorkspaceContent: React.FC = () => {
  const { activeTab, refSession, userSession, loadZipIntoSlot, isMapExpanded } = useTelemetry();
  const [windowDragActive, setWindowDragActive] = useState(false);

  const hasAnySession = Boolean(refSession || userSession);

  const handleGlobalDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setWindowDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    if (files.length >= 2) {
      await loadZipIntoSlot('ref', files[0]);
      await loadZipIntoSlot('user', files[1]);
    } else if (!refSession) {
      await loadZipIntoSlot('ref', files[0]);
    } else {
      await loadZipIntoSlot('user', files[0]);
    }
  };

  return (
    <div
      id="top"
      onDragOver={(e) => {
        e.preventDefault();
        if (!windowDragActive) setWindowDragActive(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setWindowDragActive(false);
      }}
      onDrop={handleGlobalDrop}
      className="min-h-screen flex flex-col bg-black text-neutral-100 relative"
    >
      <HeaderBar />

      {!hasAnySession ? (
        <EmptyDropWorkspace />
      ) : (
        <main className="flex-1 p-4 lg:p-6 flex flex-col gap-6 max-w-[1920px] w-full mx-auto">
          {activeTab === 'telemetry' && (
            <>
              {/* Primary Engineering Console: 2D Track Canvas + Synchronized Telemetry Stack */}
              <div
                className={
                  isMapExpanded
                    ? 'flex flex-col gap-6'
                    : 'grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch'
                }
              >
                <div
                  className={
                    isMapExpanded
                      ? 'w-full flex flex-col h-[72vh] min-h-[560px]'
                      : 'lg:col-span-5 flex flex-col min-h-[540px]'
                  }
                >
                  <TrackCanvas />
                </div>
                <div className={isMapExpanded ? 'w-full flex flex-col' : 'lg:col-span-7 flex flex-col'}>
                  <TelemetryStack />
                </div>
              </div>

              {/* Bottom Corner & Apex Summary Table */}
              <CornerTable compact={false} />
            </>
          )}

          {activeTab === 'inspector' && <ArchiveInspector />}
        </main>
      )}
    </div>
  );
};

export default function App() {
  return (
    <I18nProvider>
      <TelemetryProvider>
        <WorkspaceContent />
      </TelemetryProvider>
    </I18nProvider>
  );
}
