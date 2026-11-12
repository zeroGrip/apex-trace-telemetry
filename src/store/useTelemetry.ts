import React, { createContext, useContext, useState, useMemo, useCallback } from 'react';
import {
  ParsedApexArchive,
  packApexArchiveToZip,
} from '../core/parser';
import {
  ParsedLap,
  splitArchiveIntoLaps,
  selectBestDefaultLap,
} from '../core/lapSplitter';
import { parseZipInWorker } from '../core/archiveWorkerClient';
import {
  ResampledLapGrid,
  ComparisonPoint,
  resampleLapToMeterGrid,
  buildLapComparisonGrid,
} from '../core/resampler';
import {
  ReconstructedTrackSurface,
  buildTrackSurface,
} from '../core/trackBuilder';
import {
  PairedExtremumBadge,
  buildPairedExtremaBadges,
} from '../core/extrema';
import {
  generateBuiltInDemoSessions,
  loadAttachedSpecSampleArchive,
} from '../core/demoGenerator';

export type TrajectoryColorMode = 'speed' | 'pedals' | 'delta';
export type ActiveWorkspaceTab = 'telemetry' | 'inspector';

export interface TelemetrySessionSlot {
  archive: ParsedApexArchive;
  laps: ParsedLap[];
  selectedLapNum: number;
}

interface TelemetryStoreValue {
  refSession: TelemetrySessionSlot | null;
  userSession: TelemetrySessionSlot | null;
  refLap: ParsedLap | null;
  userLap: ParsedLap | null;
  refGrid: ResampledLapGrid | null;
  userGrid: ResampledLapGrid | null;
  comparisonGrid: ComparisonPoint[];
  trackSurface: ReconstructedTrackSurface | null;
  extremaBadges: PairedExtremumBadge[];
  trackLengthM: number;

  /** Current synchronized cursor position in meters (0 .. trackLengthM) */
  cursorDistanceM: number;
  setCursorDistanceM: (d: number) => void;

  /** Zoom window in meters [startM, endM] for telemetry plots */
  zoomRangeM: [number, number] | null;
  setZoomRangeM: (range: [number, number] | null) => void;

  /** Map visualization settings */
  colorMode: TrajectoryColorMode;
  setColorMode: (mode: TrajectoryColorMode) => void;
  showExtremaBadges: boolean;
  setShowExtremaBadges: (show: boolean) => void;
  showAsphaltBounds: boolean;
  setShowAsphaltBounds: (show: boolean) => void;
  isMapExpanded: boolean;
  setIsMapExpanded: React.Dispatch<React.SetStateAction<boolean>>;

  /** Active view tab */
  activeTab: ActiveWorkspaceTab;
  setActiveTab: (tab: ActiveWorkspaceTab) => void;

  /** File & Demo actions */
  loadZipIntoSlot: (slot: 'ref' | 'user', file: File) => Promise<void>;
  selectLapInSlot: (slot: 'ref' | 'user', lapNumber: number) => void;
  swapSessions: () => void;
  clearSlot: (slot: 'ref' | 'user') => void;
  loadBuiltInFullDemo: () => void;
  loadSpecFixtureSample: (uncleanStop?: boolean) => Promise<void>;
  downloadSlotAsApexZip: (slot: 'ref' | 'user') => void;

  isLoading: boolean;
  errorMessage: string | null;
  clearError: () => void;
}

const TelemetryContext = createContext<TelemetryStoreValue | null>(null);

export const TelemetryProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [refSession, setRefSession] = useState<TelemetrySessionSlot | null>(null);
  const [userSession, setUserSession] = useState<TelemetrySessionSlot | null>(null);
  const [cursorDistanceM, setCursorDistanceMRaw] = useState<number>(640);
  const [zoomRangeM, setZoomRangeM] = useState<[number, number] | null>(null);
  const [colorMode, setColorMode] = useState<TrajectoryColorMode>('speed');
  const [showExtremaBadges, setShowExtremaBadges] = useState<boolean>(true);
  const [showAsphaltBounds, setShowAsphaltBounds] = useState<boolean>(true);
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveWorkspaceTab>('telemetry');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadBuiltInFullDemo = useCallback(() => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const { refArchive, userArchive } = generateBuiltInDemoSessions();
      const refLaps = splitArchiveIntoLaps(refArchive);
      const userLaps = splitArchiveIntoLaps(userArchive);

      setRefSession({
        archive: refArchive,
        laps: refLaps,
        selectedLapNum: selectBestDefaultLap(refLaps),
      });
      setUserSession({
        archive: userArchive,
        laps: userLaps,
        selectedLapNum: selectBestDefaultLap(userLaps),
      });
      setZoomRangeM(null);
      setCursorDistanceMRaw(650);
    } catch (e) {
      setErrorMessage((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadSpecFixtureSample = useCallback(async (uncleanStop = false) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const sampleArchive = await loadAttachedSpecSampleArchive(uncleanStop);
      const sampleLaps = splitArchiveIntoLaps(sampleArchive);
      const chosenLap = selectBestDefaultLap(sampleLaps);

      setRefSession({
        archive: sampleArchive,
        laps: sampleLaps,
        selectedLapNum: chosenLap,
      });
      setUserSession(null);
      setZoomRangeM(null);
      // Set cursor to the start of the sample's valid distance range (0.25 * 7004 = 1751m)
      setCursorDistanceMRaw(1755);
    } catch (e) {
      setErrorMessage(`Ошибка загрузки тестового сэмпла: ${(e as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadZipIntoSlot = useCallback(async (slot: 'ref' | 'user', file: File) => {
    try {
      setIsLoading(true);
      setErrorMessage(null);
      const buffer = await file.arrayBuffer();
      const { archive, laps, selectedLapNum } = await parseZipInWorker(file.name, buffer);

      const newSlot: TelemetrySessionSlot = {
        archive,
        laps,
        selectedLapNum,
      };

      if (slot === 'ref') {
        setRefSession(newSlot);
      } else {
        setUserSession(newSlot);
      }
      setZoomRangeM(null);
    } catch (e) {
      setErrorMessage(`Не удалось прочитать архив "${file.name}": ${(e as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const selectLapInSlot = useCallback((slot: 'ref' | 'user', lapNumber: number) => {
    if (slot === 'ref') {
      setRefSession((prev) => (prev ? { ...prev, selectedLapNum: lapNumber } : null));
    } else {
      setUserSession((prev) => (prev ? { ...prev, selectedLapNum: lapNumber } : null));
    }
  }, []);

  const swapSessions = useCallback(() => {
    setRefSession(userSession);
    setUserSession(refSession);
  }, [refSession, userSession]);

  const clearSlot = useCallback((slot: 'ref' | 'user') => {
    if (slot === 'ref') setRefSession(null);
    else setUserSession(null);
  }, []);

  const downloadSlotAsApexZip = useCallback(
    (slot: 'ref' | 'user') => {
      const target = slot === 'ref' ? refSession : userSession;
      if (!target) return;
      const zippedBytes = packApexArchiveToZip(target.archive);
      const blob = new Blob([zippedBytes as unknown as BlobPart], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = target.archive.fileName.endsWith('.apex.zip')
        ? target.archive.fileName
        : `${target.archive.fileName}.apex.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [refSession, userSession]
  );

  const refLap = useMemo(() => {
    if (!refSession) return null;
    return (
      refSession.laps.find((l) => l.lapNumber === refSession.selectedLapNum) ??
      refSession.laps[0] ??
      null
    );
  }, [refSession]);

  const userLap = useMemo(() => {
    if (!userSession) return null;
    return (
      userSession.laps.find((l) => l.lapNumber === userSession.selectedLapNum) ??
      userSession.laps[0] ??
      null
    );
  }, [userSession]);

  const trackLengthM = useMemo(() => {
    const refLen =
      refSession?.archive.manifest.track?.lengthM ??
      refSession?.archive.track?.track?.lengthM ??
      null;
    const userLen =
      userSession?.archive.manifest.track?.lengthM ??
      userSession?.archive.track?.track?.lengthM ??
      null;
    const raw = refLen && refLen > 0 ? refLen : userLen && userLen > 0 ? userLen : 4655;
    return Math.round(raw);
  }, [refSession, userSession]);

  const refGrid = useMemo(() => {
    if (!refLap) return null;
    return resampleLapToMeterGrid(refLap, trackLengthM);
  }, [refLap, trackLengthM]);

  const userGrid = useMemo(() => {
    if (!userLap) return null;
    return resampleLapToMeterGrid(userLap, trackLengthM);
  }, [userLap, trackLengthM]);

  const comparisonGrid = useMemo(() => {
    return buildLapComparisonGrid(refGrid, userGrid);
  }, [refGrid, userGrid]);

  const trackSurface = useMemo(() => {
    // Borrow track.json from whichever session has a valid spline (per schema.md)
    const primaryTrack = refSession?.archive.track ?? userSession?.archive.track ?? null;
    const framesList = [
      ...(refSession ? [refSession.archive.frames] : []),
      ...(userSession ? [userSession.archive.frames] : []),
    ];
    if (!primaryTrack && framesList.length === 0) return null;
    return buildTrackSurface(primaryTrack, framesList, trackLengthM);
  }, [refSession, userSession, trackLengthM]);

  const extremaBadges = useMemo(() => {
    return buildPairedExtremaBadges(refGrid, userGrid, comparisonGrid, 12);
  }, [refGrid, userGrid, comparisonGrid]);

  const setCursorDistanceM = useCallback(
    (d: number) => {
      const clamped = Math.max(0, Math.min(trackLengthM, Math.round(d)));
      setCursorDistanceMRaw(clamped);
    },
    [trackLengthM]
  );

  const clearError = useCallback(() => setErrorMessage(null), []);

  const value: TelemetryStoreValue = {
    refSession,
    userSession,
    refLap,
    userLap,
    refGrid,
    userGrid,
    comparisonGrid,
    trackSurface,
    extremaBadges,
    trackLengthM,
    cursorDistanceM,
    setCursorDistanceM,
    zoomRangeM,
    setZoomRangeM,
    colorMode,
    setColorMode,
    showExtremaBadges,
    setShowExtremaBadges,
    showAsphaltBounds,
    setShowAsphaltBounds,
    isMapExpanded,
    setIsMapExpanded,
    activeTab,
    setActiveTab,
    loadZipIntoSlot,
    selectLapInSlot,
    swapSessions,
    clearSlot,
    loadBuiltInFullDemo,
    loadSpecFixtureSample,
    downloadSlotAsApexZip,
    isLoading,
    errorMessage,
    clearError,
  };

  return React.createElement(TelemetryContext.Provider, { value }, children);
};

export function useTelemetry(): TelemetryStoreValue {
  const ctx = useContext(TelemetryContext);
  if (!ctx) {
    throw new Error('useTelemetry must be used within a TelemetryProvider');
  }
  return ctx;
}
