import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ParsedLap, formatLapTime } from '../core/lapSplitter';

export type Language = 'en' | 'ru' | 'de' | 'es' | 'pt' | 'it' | 'fr' | 'zh' | 'ja';

export interface LanguageOption {
  code: Language;
  label: string;
  short: string;
}

export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'de', label: 'Deutsch', short: 'DE' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'pt', label: 'Português', short: 'PT' },
  { code: 'it', label: 'Italiano', short: 'IT' },
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'zh', label: '中文', short: 'ZH' },
  { code: 'ja', label: '日本語', short: 'JA' },
];

const SUPPORTED_CODES = new Set<Language>(LANGUAGE_OPTIONS.map((o) => o.code));
const STORAGE_KEY = 'apex_trace_lang';

/**
 * Detects initial language from localStorage or browser settings.
 * Defaults to 'en' if browser language is not in the supported list.
 */
export function detectInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null;
    if (saved && SUPPORTED_CODES.has(saved)) {
      return saved;
    }
  } catch {
    // Ignore storage access issues
  }

  if (typeof navigator !== 'undefined') {
    const candidates = [
      ...(Array.isArray(navigator.languages) ? navigator.languages : []),
      navigator.language,
    ].filter(Boolean);

    for (const raw of candidates) {
      const prefix = raw.toLowerCase().split('-')[0] as Language;
      if (SUPPORTED_CODES.has(prefix)) {
        return prefix;
      }
    }
  }

  return 'en';
}

export interface TranslationsShape {
  common: {
    pilotA: string;
    pilotAShort: string;
    pilotB: string;
    pilotBShort: string;
    metersShort: string;
    secondsShort: string;
    kmh: string;
    framesShort: string;
    framesFull: string;
    newtonsShort: string;
    degShort: string;
    gearShort: string;
    close: string;
    unknownCar: string;
    remote: string;
    local: string;
  };
  dropWorkspace: {
    title: string;
    subtitle: string;
    dropOrClick: string;
    unpacking: string;
  };
  header: {
    tabTelemetry: string;
    tabInspector: string;
    selectZip: string;
    selectZipTitleA: string;
    selectZipTitleB: string;
    downloadZipTitle: string;
    clearSlotTitleA: string;
    clearSlotTitleB: string;
    lapLabel: string;
    dropInlineA: string;
    dropInlineB: string;
    lapDelta: string;
    swap: string;
    swapTitle: string;
    waitingArchive: string;
    resetTooltip: string;
    langSwitchTitle: string;
  };
  lapStatus: {
    lapWord: string;
    partial: string;
  };
  trackCanvas: {
    circuitFallback: string;
    modeSpeed: string;
    modePedals: string;
    modeDelta: string;
    vminVmaxTitle: string;
    surfaceBtn: string;
    surfaceTitle: string;
    resetCanvasLabel: string;
    hudDistance: string;
    hudGear: string;
    zoomInTitle: string;
    zoomOutTitle: string;
    expandSplitTitle: string;
    expandFullTitle: string;
    resetViewTitle: string;
    legendPilotA: string;
    legendPilotB: string;
    legendSlow: string;
    legendMax: string;
    legendThrottle: string;
    legendBrake: string;
    legendCoast: string;
    legendGain: string;
    legendLoss: string;
  };
  telemetryStack: {
    title: string;
    subtitle: string;
    fullLap: string;
    resetZoom: string;
    wheelsBtn: string;
    wheelsTitle: string;
    netcodeNotice: string;
    plotDelta: string;
    plotSpeed: string;
    plotGear: string;
    plotPedals: string;
    plotSteer: string;
    plotWheels: string;
    readoutGas: string;
    readoutBrake: string;
    readoutClutch: string;
    readoutAvgLoad: string;
  };
  cornerTable: {
    title: string;
    subtitle: string;
    filterVmin: string;
    filterVmax: string;
    filterAll: string;
    empty: string;
    colPoint: string;
    colDistance: string;
    colPilotA: string;
    colPilotB: string;
    colSpeedDelta: string;
    colGear: string;
    colBrakePoint: string;
    colTimeLoss: string;
    colAction: string;
    typeApex: string;
    typeStraight: string;
    actionFocusTitle: string;
    actionZoomTitle: string;
  };
  inspector: {
    empty: string;
    titlePrefix: string;
    fileLabel: string;
    sessionLabel: string;
    recordedLabel: string;
    chunksLabel: string;
    metaHeader: string;
    driverLabel: string;
    carLabel: string;
    remoteLabel: string;
    provenanceLabel: string;
    trackLabel: string;
    lengthLabel: string;
    splineLabel: string;
    algoLabel: string;
    samplesLabel: string;
    halfWidthLabel: string;
    widthApprox: string;
    warningsHeader: string;
    rawJsonHeaderPrefix: string;
    rawJsonHeaderAndDump: string;
    coverageHeader: string;
    sourceLabel: string;
    sourceSummary: string;
    sourceRecomputed: string;
    totalFramesLabel: string;
    filterAll: string;
    filterFrame: string;
    filterWheel: string;
    filterMissing: string;
    colChannelId: string;
    colScope: string;
    colPresent: string;
    colTotal: string;
    colCoverage: string;
    colStatus: string;
    statusNull: string;
    statusNetcode: string;
    statusRecorded: string;
  };
  errors: {
    sampleLoadFailed: string;
    archiveReadFailed: string;
  };
}

export const translations: Record<Language, TranslationsShape> = {
  en: {
    common: {
      pilotA: 'PILOT A',
      pilotAShort: 'Pilot A',
      pilotB: 'PILOT B',
      pilotBShort: 'Pilot B',
      metersShort: 'm',
      secondsShort: 's',
      kmh: 'km/h',
      framesShort: 'fr.',
      framesFull: 'frames',
      newtonsShort: 'N',
      degShort: 'deg.',
      gearShort: 'Gear',
      close: 'Dismiss',
      unknownCar: 'Unknown car',
      remote: 'Remote',
      local: 'Local',
    },
    dropWorkspace: {
      title: 'Drop .apex.zip telemetry archive',
      subtitle: 'Drop one or two .apex.zip files to compare laps, racing lines, and telemetry.',
      dropOrClick: 'Drop .apex.zip or click to browse',
      unpacking: 'Unpacking archive...',
    },
    header: {
      tabTelemetry: 'Telemetry',
      tabInspector: 'Archive inspector',
      selectZip: 'Select .apex.zip',
      selectZipTitleA: 'Load archive for Pilot A',
      selectZipTitleB: 'Load archive for Pilot B',
      downloadZipTitle: 'Download',
      clearSlotTitleA: 'Clear Pilot A',
      clearSlotTitleB: 'Clear Pilot B',
      lapLabel: 'Lap:',
      dropInlineA: 'Drop .apex.zip or click to load Pilot A',
      dropInlineB: 'Drop .apex.zip or click to load Pilot B',
      lapDelta: 'Lap delta',
      swap: 'Swap',
      swapTitle: 'Swap Pilot A and Pilot B',
      waitingArchive: 'No archive',
      resetTooltip: 'Teleport to pits (note="reset"). Trajectory line is broken.',
      langSwitchTitle: 'Language',
    },
    lapStatus: {
      lapWord: 'Lap',
      partial: 'PARTIAL',
    },
    trackCanvas: {
      circuitFallback: 'Circuit',
      modeSpeed: 'Speed',
      modePedals: 'Pedals',
      modeDelta: 'Delta',
      vminVmaxTitle: 'Toggle Vmin/Vmax markers',
      surfaceBtn: 'Surface',
      surfaceTitle: 'Toggle asphalt boundaries',
      resetCanvasLabel: 'RESET',
      hudDistance: 'DIST:',
      hudGear: 'Gear:',
      zoomInTitle: 'Zoom in',
      zoomOutTitle: 'Zoom out',
      expandSplitTitle: 'Side-by-side layout',
      expandFullTitle: 'Full-width map',
      resetViewTitle: 'Reset view',
      legendPilotA: '- - [A] Pilot A',
      legendPilotB: '━━ [B] Pilot B',
      legendSlow: 'Slow',
      legendMax: 'Max',
      legendThrottle: '■ Throttle',
      legendBrake: '■ Brake',
      legendCoast: '■ Coast',
      legendGain: '■ Gain',
      legendLoss: '■ Loss',
    },
    telemetryStack: {
      title: 'Telemetry channels',
      subtitle: '· 1 m grid · drag or scroll to zoom',
      fullLap: 'Full lap',
      resetZoom: 'Reset',
      wheelsBtn: 'Wheels (loadK)',
      wheelsTitle: 'Toggle wheel load channel',
      netcodeNotice: '▲ Remote car: wheel data (`w.*`) is extrapolated from netcode.',
      plotDelta: 'Delta-T',
      plotSpeed: 'Speed',
      plotGear: 'Gear',
      plotPedals: 'Pedals',
      plotSteer: 'Steer',
      plotWheels: 'Wheel load (loadK)',
      readoutGas: 'Thr',
      readoutBrake: 'Brk',
      readoutClutch: 'Clu',
      readoutAvgLoad: 'Avg loadK',
    },
    cornerTable: {
      title: 'Apexes (Vmin) & straights (Vmax)',
      subtitle: '· click a row to jump to position',
      filterVmin: 'Corners (Vmin)',
      filterVmax: 'Straights (Vmax)',
      filterAll: 'All',
      empty: 'No speed extrema (≥ 12 km/h) detected in this lap.',
      colPoint: 'Point',
      colDistance: 'Distance',
      colPilotA: '[A] Pilot A',
      colPilotB: '[B] Pilot B',
      colSpeedDelta: 'Speed Δ',
      colGear: 'Gear (A | B)',
      colBrakePoint: 'Braking (A | B)',
      colTimeLoss: 'Time Δ',
      colAction: 'Action',
      typeApex: 'Apex',
      typeStraight: 'Top speed',
      actionFocusTitle: 'Focus on map',
      actionZoomTitle: 'Zoom on charts',
    },
    inspector: {
      empty: 'Load an .apex.zip archive to inspect manifest and channel coverage.',
      titlePrefix: 'Archive inspector `.apex.zip` (schema v',
      fileLabel: 'File:',
      sessionLabel: 'Session:',
      recordedLabel: 'Recorded:',
      chunksLabel: 'Chunks:',
      metaHeader: 'Manifest & track surface metadata',
      driverLabel: 'Driver:',
      carLabel: 'Car:',
      remoteLabel: 'Remote car:',
      provenanceLabel: 'Wheel provenance:',
      trackLabel: 'Track:',
      lengthLabel: 'Track length:',
      splineLabel: 'Spline:',
      algoLabel: 'Surface source:',
      samplesLabel: 'Samples |lat| > 0.15:',
      halfWidthLabel: 'Half-width W(p):',
      widthApprox: 'width ≈',
      warningsHeader: 'Warnings:',
      rawJsonHeaderPrefix: 'Raw `manifest.json`',
      rawJsonHeaderAndDump: ' & `dump_car.json`',
      coverageHeader: 'Channel coverage (`summary.coverage`)',
      sourceLabel: 'Source:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'computed from frames',
      totalFramesLabel: 'Frames:',
      filterAll: 'All',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Missing (null)',
      colChannelId: 'Channel',
      colScope: 'Scope',
      colPresent: 'Present',
      colTotal: 'Total',
      colCoverage: 'Coverage',
      colStatus: 'Status',
      statusNull: '✖ null (not reported by game)',
      statusNetcode: '▲ netcode (remote car extrapolation)',
      statusRecorded: '● recorded from StateCar',
    },
    errors: {
      sampleLoadFailed: 'Failed to load sample',
      archiveReadFailed: 'Failed to read archive',
    },
  },

  ru: {
    common: {
      pilotA: 'ПИЛОТ А',
      pilotAShort: 'Пилот А',
      pilotB: 'ПИЛОТ Б',
      pilotBShort: 'Пилот Б',
      metersShort: 'м',
      secondsShort: 'с',
      kmh: 'км/ч',
      framesShort: 'фр.',
      framesFull: 'фреймов',
      newtonsShort: 'Н',
      degShort: 'град.',
      gearShort: 'Пер',
      close: 'Закрыть',
      unknownCar: 'Неизвестно',
      remote: 'Remote',
      local: 'Local',
    },
    dropWorkspace: {
      title: 'Перетащите архив .apex.zip',
      subtitle: 'Загрузите один или два файла .apex.zip для сравнения кругов, траекторий и телеметрии.',
      dropOrClick: 'Перетащите .apex.zip или выберите файл',
      unpacking: 'Распаковка архива...',
    },
    header: {
      tabTelemetry: 'Телеметрия',
      tabInspector: 'Инспектор архива',
      selectZip: 'Выбрать .apex.zip',
      selectZipTitleA: 'Загрузить архив для Пилота А',
      selectZipTitleB: 'Загрузить архив для Пилота Б',
      downloadZipTitle: 'Скачать',
      clearSlotTitleA: 'Очистить слот А',
      clearSlotTitleB: 'Очистить слот Б',
      lapLabel: 'Круг:',
      dropInlineA: 'Перетащите .apex.zip или нажмите для выбора (Пилот А)',
      dropInlineB: 'Перетащите .apex.zip или нажмите для выбора (Пилот Б)',
      lapDelta: 'Дельта круга',
      swap: 'Поменять',
      swapTitle: 'Поменять местами Пилота А и Пилота Б',
      waitingArchive: 'Нет архива',
      resetTooltip: 'Телепорт в боксы (note="reset"). Линия траектории разорвана.',
      langSwitchTitle: 'Язык',
    },
    lapStatus: {
      lapWord: 'Круг',
      partial: 'ЧАСТИЧНЫЙ',
    },
    trackCanvas: {
      circuitFallback: 'Трасса',
      modeSpeed: 'Скорость',
      modePedals: 'Педали',
      modeDelta: 'Дельта',
      vminVmaxTitle: 'Показать / скрыть маркеры Vmin и Vmax',
      surfaceBtn: 'Полотно',
      surfaceTitle: 'Показать / скрыть границы асфальта',
      resetCanvasLabel: 'RESET',
      hudDistance: 'ДИСТ:',
      hudGear: 'Пер:',
      zoomInTitle: 'Приблизить',
      zoomOutTitle: 'Отдалить',
      expandSplitTitle: 'В две колонки',
      expandFullTitle: 'На всю ширину',
      resetViewTitle: 'Сбросить вид',
      legendPilotA: '- - [A] Пилот А',
      legendPilotB: '━━ [B] Пилот Б',
      legendSlow: 'Медленно',
      legendMax: 'Макс',
      legendThrottle: '■ Газ',
      legendBrake: '■ Тормоз',
      legendCoast: '■ Накат',
      legendGain: '■ Отыгрыш',
      legendLoss: '■ Потеря',
    },
    telemetryStack: {
      title: 'Графики телеметрии',
      subtitle: '· шаг 1 м · выделите область или крутите колесо для зума',
      fullLap: 'Весь круг',
      resetZoom: 'Сброс',
      wheelsBtn: 'Колёса (loadK)',
      wheelsTitle: 'Показать / скрыть нагрузку на колёса',
      netcodeNotice: '▲ Удалённая машина: данные колёс (`w.*`) получены из сетевого пакета (netcode).',
      plotDelta: 'Дельта времени',
      plotSpeed: 'Скорость',
      plotGear: 'Передача',
      plotPedals: 'Педали',
      plotSteer: 'Руль',
      plotWheels: 'Нагрузка на колёса (loadK)',
      readoutGas: 'Газ',
      readoutBrake: 'Торм',
      readoutClutch: 'Сцепл',
      readoutAvgLoad: 'Ср. loadK',
    },
    cornerTable: {
      title: 'Апексы (Vmin) и прямые (Vmax)',
      subtitle: '· нажмите на строку для перехода к точке',
      filterVmin: 'Повороты (Vmin)',
      filterVmax: 'Прямые (Vmax)',
      filterAll: 'Все',
      empty: 'Локальные экстремумы скорости (≥ 12 км/ч) не найдены.',
      colPoint: 'Точка',
      colDistance: 'Дистанция',
      colPilotA: '[A] Пилот А',
      colPilotB: '[B] Пилот Б',
      colSpeedDelta: 'Разница V',
      colGear: 'Передача (A | B)',
      colBrakePoint: 'Торможение (A | B)',
      colTimeLoss: 'Дельта времени',
      colAction: 'Действие',
      typeApex: 'Апекс',
      typeStraight: 'Макс. скорость',
      actionFocusTitle: 'Показать на карте',
      actionZoomTitle: 'Приблизить на графиках',
    },
    inspector: {
      empty: 'Загрузите архив .apex.zip для просмотра манифеста и покрытия каналов.',
      titlePrefix: 'Инспектор архива `.apex.zip` (схема v',
      fileLabel: 'Файл:',
      sessionLabel: 'Сессия:',
      recordedLabel: 'Записано:',
      chunksLabel: 'Чанки:',
      metaHeader: 'Метаданные манифеста и трассы',
      driverLabel: 'Пилот:',
      carLabel: 'Машина:',
      remoteLabel: 'Удалённая:',
      provenanceLabel: 'Источник колёс:',
      trackLabel: 'Трасса:',
      lengthLabel: 'Длина:',
      splineLabel: 'Сплайн:',
      algoLabel: 'Границы асфальта:',
      samplesLabel: 'Замеров |lat| > 0.15:',
      halfWidthLabel: 'Полуширина W(p):',
      widthApprox: 'ширина ≈',
      warningsHeader: 'Предупреждения:',
      rawJsonHeaderPrefix: 'JSON `manifest.json`',
      rawJsonHeaderAndDump: ' и `dump_car.json`',
      coverageHeader: 'Покрытие каналов (`summary.coverage`)',
      sourceLabel: 'Источник:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'расчёт по фреймам',
      totalFramesLabel: 'Фреймов:',
      filterAll: 'Все',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Пропуски (null)',
      colChannelId: 'Канал',
      colScope: 'Область',
      colPresent: 'Есть',
      colTotal: 'Всего',
      colCoverage: 'Покрытие',
      colStatus: 'Статус',
      statusNull: '✖ null (канал не передан игрой)',
      statusNetcode: '▲ netcode (сетевая экстраполяция)',
      statusRecorded: '● записано из StateCar',
    },
    errors: {
      sampleLoadFailed: 'Ошибка загрузки сэмпла',
      archiveReadFailed: 'Не удалось прочитать архив',
    },
  },

  de: {
    common: {
      pilotA: 'FAHRER A',
      pilotAShort: 'Fahrer A',
      pilotB: 'FAHRER B',
      pilotBShort: 'Fahrer B',
      metersShort: 'm',
      secondsShort: 's',
      kmh: 'km/h',
      framesShort: 'Fr.',
      framesFull: 'Frames',
      newtonsShort: 'N',
      degShort: '°',
      gearShort: 'Gang',
      close: 'Schließen',
      unknownCar: 'Unbekanntes Fahrzeug',
      remote: 'Remote',
      local: 'Lokal',
    },
    dropWorkspace: {
      title: '.apex.zip Telemetrie-Archiv ablegen',
      subtitle: 'Eine oder zwei .apex.zip-Dateien ablegen, um Runden, Linien und Telemetrie zu vergleichen.',
      dropOrClick: '.apex.zip ablegen oder klicken',
      unpacking: 'Archiv wird entpackt...',
    },
    header: {
      tabTelemetry: 'Telemetrie',
      tabInspector: 'Archiv-Inspektor',
      selectZip: '.apex.zip wählen',
      selectZipTitleA: 'Archiv für Fahrer A laden',
      selectZipTitleB: 'Archiv für Fahrer B laden',
      downloadZipTitle: 'Herunterladen',
      clearSlotTitleA: 'Fahrer A leeren',
      clearSlotTitleB: 'Fahrer B leeren',
      lapLabel: 'Runde:',
      dropInlineA: '.apex.zip ablegen oder klicken (Fahrer A)',
      dropInlineB: '.apex.zip ablegen oder klicken (Fahrer B)',
      lapDelta: 'Runden-Delta',
      swap: 'Tauschen',
      swapTitle: 'Fahrer A und B tauschen',
      waitingArchive: 'Kein Archiv',
      resetTooltip: 'Teleport in die Box (note="reset"). Linie unterbrochen.',
      langSwitchTitle: 'Sprache',
    },
    lapStatus: {
      lapWord: 'Runde',
      partial: 'TEILWEISE',
    },
    trackCanvas: {
      circuitFallback: 'Strecke',
      modeSpeed: 'Tempo',
      modePedals: 'Pedale',
      modeDelta: 'Delta',
      vminVmaxTitle: 'Vmin/Vmax ein-/ausblenden',
      surfaceBtn: 'Asphalt',
      surfaceTitle: 'Streckengrenzen ein-/ausblenden',
      resetCanvasLabel: 'RESET',
      hudDistance: 'DIST:',
      hudGear: 'Gang:',
      zoomInTitle: 'Vergrößern',
      zoomOutTitle: 'Verkleinern',
      expandSplitTitle: 'Zweispaltige Ansicht',
      expandFullTitle: 'Volle Breite',
      resetViewTitle: 'Ansicht zurücksetzen',
      legendPilotA: '- - [A] Fahrer A',
      legendPilotB: '━━ [B] Fahrer B',
      legendSlow: 'Langsam',
      legendMax: 'Max',
      legendThrottle: '■ Gas',
      legendBrake: '■ Bremse',
      legendCoast: '■ Rollen',
      legendGain: '■ Gewinn',
      legendLoss: '■ Verlust',
    },
    telemetryStack: {
      title: 'Telemetrie-Kanäle',
      subtitle: '· 1-m-Raster · Ziehen oder Mausrad zum Zoomen',
      fullLap: 'Ganze Runde',
      resetZoom: 'Reset',
      wheelsBtn: 'Räder (loadK)',
      wheelsTitle: 'Radlast-Kanal ein-/ausblenden',
      netcodeNotice: '▲ Remote-Fahrzeug: Raddaten (`w.*`) stammen aus Netcode.',
      plotDelta: 'Delta-T',
      plotSpeed: 'Geschwindigkeit',
      plotGear: 'Gang',
      plotPedals: 'Pedale',
      plotSteer: 'Lenkwinkel',
      plotWheels: 'Radlast (loadK)',
      readoutGas: 'Gas',
      readoutBrake: 'Brm',
      readoutClutch: 'Kpl',
      readoutAvgLoad: 'Ø loadK',
    },
    cornerTable: {
      title: 'Scheitelpunkte (Vmin) & Geraden (Vmax)',
      subtitle: '· Zeile anklicken, um zum Punkt zu springen',
      filterVmin: 'Kurven (Vmin)',
      filterVmax: 'Geraden (Vmax)',
      filterAll: 'Alle',
      empty: 'Keine Geschwindigkeits-Extrema (≥ 12 km/h) gefunden.',
      colPoint: 'Punkt',
      colDistance: 'Distanz',
      colPilotA: '[A] Fahrer A',
      colPilotB: '[B] Fahrer B',
      colSpeedDelta: 'Tempo Δ',
      colGear: 'Gang (A | B)',
      colBrakePoint: 'Bremspunkt (A | B)',
      colTimeLoss: 'Zeit Δ',
      colAction: 'Aktion',
      typeApex: 'Scheitelpunkt',
      typeStraight: 'Topspeed',
      actionFocusTitle: 'Auf Karte zeigen',
      actionZoomTitle: 'Im Graphen zoomen',
    },
    inspector: {
      empty: '.apex.zip laden, um Manifest und Kanalabdeckung zu prüfen.',
      titlePrefix: 'Archiv-Inspektor `.apex.zip` (Schema v',
      fileLabel: 'Datei:',
      sessionLabel: 'Session:',
      recordedLabel: 'Aufgenommen:',
      chunksLabel: 'Chunks:',
      metaHeader: 'Manifest- & Strecken-Metadaten',
      driverLabel: 'Fahrer:',
      carLabel: 'Fahrzeug:',
      remoteLabel: 'Remote:',
      provenanceLabel: 'Räder-Quelle:',
      trackLabel: 'Strecke:',
      lengthLabel: 'Länge:',
      splineLabel: 'Spline:',
      algoLabel: 'Asphaltgrenzen:',
      samplesLabel: 'Samples |lat| > 0.15:',
      halfWidthLabel: 'Halbbreite W(p):',
      widthApprox: 'Breite ≈',
      warningsHeader: 'Warnungen:',
      rawJsonHeaderPrefix: 'JSON `manifest.json`',
      rawJsonHeaderAndDump: ' & `dump_car.json`',
      coverageHeader: 'Kanalabdeckung (`summary.coverage`)',
      sourceLabel: 'Quelle:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'aus Frames berechnet',
      totalFramesLabel: 'Frames:',
      filterAll: 'Alle',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Fehlend (null)',
      colChannelId: 'Kanal',
      colScope: 'Bereich',
      colPresent: 'Vorhanden',
      colTotal: 'Gesamt',
      colCoverage: 'Abdeckung',
      colStatus: 'Status',
      statusNull: '✖ null (vom Spiel nicht gesendet)',
      statusNetcode: '▲ netcode (Remote-Extrapolation)',
      statusRecorded: '● aufgezeichnet aus StateCar',
    },
    errors: {
      sampleLoadFailed: 'Fehler beim Laden des Beispiels',
      archiveReadFailed: 'Archiv konnte nicht gelesen werden',
    },
  },

  es: {
    common: {
      pilotA: 'PILOTO A',
      pilotAShort: 'Piloto A',
      pilotB: 'PILOTO B',
      pilotBShort: 'Piloto B',
      metersShort: 'm',
      secondsShort: 's',
      kmh: 'km/h',
      framesShort: 'fr.',
      framesFull: 'frames',
      newtonsShort: 'N',
      degShort: '°',
      gearShort: 'Marcha',
      close: 'Cerrar',
      unknownCar: 'Coche desconocido',
      remote: 'Remoto',
      local: 'Local',
    },
    dropWorkspace: {
      title: 'Arrastra el archivo .apex.zip',
      subtitle: 'Suelta uno o dos archivos .apex.zip para comparar vueltas, trazadas y telemetría.',
      dropOrClick: 'Arrastra .apex.zip o haz clic',
      unpacking: 'Descomprimiendo archivo...',
    },
    header: {
      tabTelemetry: 'Telemetría',
      tabInspector: 'Inspector de archivo',
      selectZip: 'Elegir .apex.zip',
      selectZipTitleA: 'Cargar archivo para Piloto A',
      selectZipTitleB: 'Cargar archivo para Piloto B',
      downloadZipTitle: 'Descargar',
      clearSlotTitleA: 'Limpiar Piloto A',
      clearSlotTitleB: 'Limpiar Piloto B',
      lapLabel: 'Vuelta:',
      dropInlineA: 'Arrastra .apex.zip o haz clic (Piloto A)',
      dropInlineB: 'Arrastra .apex.zip o haz clic (Piloto B)',
      lapDelta: 'Delta de vuelta',
      swap: 'Cambiar',
      swapTitle: 'Intercambiar Piloto A y Piloto B',
      waitingArchive: 'Sin archivo',
      resetTooltip: 'Teletransporte a boxes (note="reset"). Trazada interrumpida.',
      langSwitchTitle: 'Idioma',
    },
    lapStatus: {
      lapWord: 'Vuelta',
      partial: 'PARCIAL',
    },
    trackCanvas: {
      circuitFallback: 'Circuito',
      modeSpeed: 'Velocidad',
      modePedals: 'Pedales',
      modeDelta: 'Delta',
      vminVmaxTitle: 'Mostrar / ocultar Vmin y Vmax',
      surfaceBtn: 'Asfalto',
      surfaceTitle: 'Mostrar / ocultar límites de pista',
      resetCanvasLabel: 'RESET',
      hudDistance: 'DIST:',
      hudGear: 'M:',
      zoomInTitle: 'Acercar',
      zoomOutTitle: 'Alejar',
      expandSplitTitle: 'Vista en dos columnas',
      expandFullTitle: 'Ancho completo',
      resetViewTitle: 'Restablecer vista',
      legendPilotA: '- - [A] Piloto A',
      legendPilotB: '━━ [B] Piloto B',
      legendSlow: 'Lento',
      legendMax: 'Máx',
      legendThrottle: '■ Acel.',
      legendBrake: '■ Freno',
      legendCoast: '■ Inercia',
      legendGain: '■ Ganancia',
      legendLoss: '■ Pérdida',
    },
    telemetryStack: {
      title: 'Canales de telemetría',
      subtitle: '· paso 1 m · arrastra o usa la rueda para zoom',
      fullLap: 'Vuelta completa',
      resetZoom: 'Reset',
      wheelsBtn: 'Ruedas (loadK)',
      wheelsTitle: 'Mostrar / ocultar carga de ruedas',
      netcodeNotice: '▲ Coche remoto: los datos de ruedas (`w.*`) provienen de netcode.',
      plotDelta: 'Delta-T',
      plotSpeed: 'Velocidad',
      plotGear: 'Marcha',
      plotPedals: 'Pedales',
      plotSteer: 'Dirección',
      plotWheels: 'Carga de ruedas (loadK)',
      readoutGas: 'Acel',
      readoutBrake: 'Fren',
      readoutClutch: 'Emb',
      readoutAvgLoad: 'Prom loadK',
    },
    cornerTable: {
      title: 'Vértices (Vmin) y rectas (Vmax)',
      subtitle: '· haz clic en una fila para ir al punto',
      filterVmin: 'Curvas (Vmin)',
      filterVmax: 'Rectas (Vmax)',
      filterAll: 'Todos',
      empty: 'No se detectaron extremos de velocidad (≥ 12 km/h) en esta vuelta.',
      colPoint: 'Punto',
      colDistance: 'Distancia',
      colPilotA: '[A] Piloto A',
      colPilotB: '[B] Piloto B',
      colSpeedDelta: 'Vel. Δ',
      colGear: 'Marcha (A | B)',
      colBrakePoint: 'Frenada (A | B)',
      colTimeLoss: 'Tiempo Δ',
      colAction: 'Acción',
      typeApex: 'Vértice',
      typeStraight: 'Vel. máx.',
      actionFocusTitle: 'Ver en mapa',
      actionZoomTitle: 'Zoom en gráficos',
    },
    inspector: {
      empty: 'Carga un archivo .apex.zip para inspeccionar el manifiesto y los canales.',
      titlePrefix: 'Inspector `.apex.zip` (esquema v',
      fileLabel: 'Archivo:',
      sessionLabel: 'Sesión:',
      recordedLabel: 'Grabado:',
      chunksLabel: 'Chunks:',
      metaHeader: 'Metadatos del manifiesto y pista',
      driverLabel: 'Piloto:',
      carLabel: 'Coche:',
      remoteLabel: 'Remoto:',
      provenanceLabel: 'Origen ruedas:',
      trackLabel: 'Circuito:',
      lengthLabel: 'Longitud:',
      splineLabel: 'Spline:',
      algoLabel: 'Límites de pista:',
      samplesLabel: 'Muestras |lat| > 0.15:',
      halfWidthLabel: 'Semiancho W(p):',
      widthApprox: 'ancho ≈',
      warningsHeader: 'Avisos:',
      rawJsonHeaderPrefix: 'JSON `manifest.json`',
      rawJsonHeaderAndDump: ' y `dump_car.json`',
      coverageHeader: 'Cobertura de canales (`summary.coverage`)',
      sourceLabel: 'Fuente:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'calculado por frames',
      totalFramesLabel: 'Frames:',
      filterAll: 'Todos',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Faltantes (null)',
      colChannelId: 'Canal',
      colScope: 'Ámbito',
      colPresent: 'Presente',
      colTotal: 'Total',
      colCoverage: 'Cobertura',
      colStatus: 'Estado',
      statusNull: '✖ null (no reportado por el juego)',
      statusNetcode: '▲ netcode (extrapolación remota)',
      statusRecorded: '● grabado de StateCar',
    },
    errors: {
      sampleLoadFailed: 'Error al cargar muestra',
      archiveReadFailed: 'No se pudo leer el archivo',
    },
  },

  pt: {
    common: {
      pilotA: 'PILOTO A',
      pilotAShort: 'Piloto A',
      pilotB: 'PILOTO B',
      pilotBShort: 'Piloto B',
      metersShort: 'm',
      secondsShort: 's',
      kmh: 'km/h',
      framesShort: 'fr.',
      framesFull: 'frames',
      newtonsShort: 'N',
      degShort: '°',
      gearShort: 'Marcha',
      close: 'Fechar',
      unknownCar: 'Carro desconhecido',
      remote: 'Remoto',
      local: 'Local',
    },
    dropWorkspace: {
      title: 'Solte o arquivo .apex.zip',
      subtitle: 'Arraste um ou dois arquivos .apex.zip para comparar voltas, traçados e telemetria.',
      dropOrClick: 'Arraste .apex.zip ou clique',
      unpacking: 'Extraindo arquivo...',
    },
    header: {
      tabTelemetry: 'Telemetria',
      tabInspector: 'Inspetor de arquivo',
      selectZip: 'Escolher .apex.zip',
      selectZipTitleA: 'Carregar arquivo para Piloto A',
      selectZipTitleB: 'Carregar arquivo para Piloto B',
      downloadZipTitle: 'Baixar',
      clearSlotTitleA: 'Limpar Piloto A',
      clearSlotTitleB: 'Limpar Piloto B',
      lapLabel: 'Volta:',
      dropInlineA: 'Arraste .apex.zip ou clique (Piloto A)',
      dropInlineB: 'Arraste .apex.zip ou clique (Piloto B)',
      lapDelta: 'Delta da volta',
      swap: 'Trocar',
      swapTitle: 'Trocar Piloto A e Piloto B',
      waitingArchive: 'Sem arquivo',
      resetTooltip: 'Teleporte para os boxes (note="reset"). Traçado interrompido.',
      langSwitchTitle: 'Idioma',
    },
    lapStatus: {
      lapWord: 'Volta',
      partial: 'PARCIAL',
    },
    trackCanvas: {
      circuitFallback: 'Circuito',
      modeSpeed: 'Velocidade',
      modePedals: 'Pedais',
      modeDelta: 'Delta',
      vminVmaxTitle: 'Mostrar / ocultar Vmin e Vmax',
      surfaceBtn: 'Asfalto',
      surfaceTitle: 'Mostrar / ocultar limites da pista',
      resetCanvasLabel: 'RESET',
      hudDistance: 'DIST:',
      hudGear: 'M:',
      zoomInTitle: 'Aproximar',
      zoomOutTitle: 'Afastar',
      expandSplitTitle: 'Duas colunas',
      expandFullTitle: 'Largura total',
      resetViewTitle: 'Resetar visão',
      legendPilotA: '- - [A] Piloto A',
      legendPilotB: '━━ [B] Piloto B',
      legendSlow: 'Lento',
      legendMax: 'Máx',
      legendThrottle: '■ Acel.',
      legendBrake: '■ Freio',
      legendCoast: '■ Rolagem',
      legendGain: '■ Ganho',
      legendLoss: '■ Perda',
    },
    telemetryStack: {
      title: 'Canais de telemetria',
      subtitle: '· grade 1 m · arraste ou use o scroll para zoom',
      fullLap: 'Volta inteira',
      resetZoom: 'Reset',
      wheelsBtn: 'Rodas (loadK)',
      wheelsTitle: 'Mostrar / ocultar carga nas rodas',
      netcodeNotice: '▲ Carro remoto: dados de rodas (`w.*`) extrapolados via netcode.',
      plotDelta: 'Delta-T',
      plotSpeed: 'Velocidade',
      plotGear: 'Marcha',
      plotPedals: 'Pedais',
      plotSteer: 'Direção',
      plotWheels: 'Carga nas rodas (loadK)',
      readoutGas: 'Acel',
      readoutBrake: 'Freio',
      readoutClutch: 'Emb',
      readoutAvgLoad: 'Méd loadK',
    },
    cornerTable: {
      title: 'Ápices (Vmin) e retas (Vmax)',
      subtitle: '· clique em uma linha para ir ao ponto',
      filterVmin: 'Curvas (Vmin)',
      filterVmax: 'Retas (Vmax)',
      filterAll: 'Todos',
      empty: 'Nenhum extremo de velocidade (≥ 12 km/h) encontrado nesta volta.',
      colPoint: 'Ponto',
      colDistance: 'Distância',
      colPilotA: '[A] Piloto A',
      colPilotB: '[B] Piloto B',
      colSpeedDelta: 'Vel. Δ',
      colGear: 'Marcha (A | B)',
      colBrakePoint: 'Frenagem (A | B)',
      colTimeLoss: 'Tempo Δ',
      colAction: 'Ação',
      typeApex: 'Ápice',
      typeStraight: 'Vel. máx.',
      actionFocusTitle: 'Focar no mapa',
      actionZoomTitle: 'Zoom nos gráficos',
    },
    inspector: {
      empty: 'Carregue um arquivo .apex.zip para inspecionar o manifesto e os canais.',
      titlePrefix: 'Inspetor `.apex.zip` (esquema v',
      fileLabel: 'Arquivo:',
      sessionLabel: 'Sessão:',
      recordedLabel: 'Gravado:',
      chunksLabel: 'Chunks:',
      metaHeader: 'Metadados do manifesto e pista',
      driverLabel: 'Piloto:',
      carLabel: 'Carro:',
      remoteLabel: 'Remoto:',
      provenanceLabel: 'Origem rodas:',
      trackLabel: 'Pista:',
      lengthLabel: 'Extensão:',
      splineLabel: 'Spline:',
      algoLabel: 'Limites da pista:',
      samplesLabel: 'Amostras |lat| > 0.15:',
      halfWidthLabel: 'Meia-largura W(p):',
      widthApprox: 'largura ≈',
      warningsHeader: 'Avisos:',
      rawJsonHeaderPrefix: 'JSON `manifest.json`',
      rawJsonHeaderAndDump: ' e `dump_car.json`',
      coverageHeader: 'Cobertura de canais (`summary.coverage`)',
      sourceLabel: 'Fonte:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'calculado dos frames',
      totalFramesLabel: 'Frames:',
      filterAll: 'Todos',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Ausentes (null)',
      colChannelId: 'Canal',
      colScope: 'Escopo',
      colPresent: 'Presente',
      colTotal: 'Total',
      colCoverage: 'Cobertura',
      colStatus: 'Status',
      statusNull: '✖ null (não informado pelo jogo)',
      statusNetcode: '▲ netcode (extrapolação remota)',
      statusRecorded: '● gravado do StateCar',
    },
    errors: {
      sampleLoadFailed: 'Erro ao carregar amostra',
      archiveReadFailed: 'Falha ao ler arquivo',
    },
  },

  it: {
    common: {
      pilotA: 'PILOTA A',
      pilotAShort: 'Pilota A',
      pilotB: 'PILOTA B',
      pilotBShort: 'Pilota B',
      metersShort: 'm',
      secondsShort: 's',
      kmh: 'km/h',
      framesShort: 'fr.',
      framesFull: 'frame',
      newtonsShort: 'N',
      degShort: '°',
      gearShort: 'Marcia',
      close: 'Chiudi',
      unknownCar: 'Auto sconosciuta',
      remote: 'Remoto',
      local: 'Locale',
    },
    dropWorkspace: {
      title: 'Trascina archivio .apex.zip',
      subtitle: 'Rilascia uno o due file .apex.zip per confrontare giri, traiettorie e telemetria.',
      dropOrClick: 'Trascina .apex.zip o clicca',
      unpacking: 'Estrazione archivio...',
    },
    header: {
      tabTelemetry: 'Telemetria',
      tabInspector: 'Ispettore archivio',
      selectZip: 'Scegli .apex.zip',
      selectZipTitleA: 'Carica archivio per Pilota A',
      selectZipTitleB: 'Carica archivio per Pilota B',
      downloadZipTitle: 'Scarica',
      clearSlotTitleA: 'Svuota Pilota A',
      clearSlotTitleB: 'Svuota Pilota B',
      lapLabel: 'Giro:',
      dropInlineA: 'Trascina .apex.zip o clicca (Pilota A)',
      dropInlineB: 'Trascina .apex.zip o clicca (Pilota B)',
      lapDelta: 'Delta giro',
      swap: 'Scambia',
      swapTitle: 'Scambia Pilota A e Pilota B',
      waitingArchive: 'Nessun archivio',
      resetTooltip: 'Teletrasporto ai box (note="reset"). Traiettoria interrotta.',
      langSwitchTitle: 'Lingua',
    },
    lapStatus: {
      lapWord: 'Giro',
      partial: 'PARZIALE',
    },
    trackCanvas: {
      circuitFallback: 'Circuito',
      modeSpeed: 'Velocità',
      modePedals: 'Pedali',
      modeDelta: 'Delta',
      vminVmaxTitle: 'Mostra / nascondi Vmin e Vmax',
      surfaceBtn: 'Asfalto',
      surfaceTitle: 'Mostra / nascondi bordi pista',
      resetCanvasLabel: 'RESET',
      hudDistance: 'DIST:',
      hudGear: 'M:',
      zoomInTitle: 'Ingrandisci',
      zoomOutTitle: 'Riduci',
      expandSplitTitle: 'Vista a due colonne',
      expandFullTitle: 'Larghezza intera',
      resetViewTitle: 'Reimposta vista',
      legendPilotA: '- - [A] Pilota A',
      legendPilotB: '━━ [B] Pilota B',
      legendSlow: 'Lento',
      legendMax: 'Max',
      legendThrottle: '■ Gas',
      legendBrake: '■ Freno',
      legendCoast: '■ Rilascio',
      legendGain: '■ Guadagno',
      legendLoss: '■ Perdita',
    },
    telemetryStack: {
      title: 'Canali telemetria',
      subtitle: '· passo 1 m · trascina o usa la rotella per lo zoom',
      fullLap: 'Giro intero',
      resetZoom: 'Reset',
      wheelsBtn: 'Ruote (loadK)',
      wheelsTitle: 'Mostra / nascondi carico ruote',
      netcodeNotice: '▲ Auto remota: dati ruote (`w.*`) estrapolati da netcode.',
      plotDelta: 'Delta-T',
      plotSpeed: 'Velocità',
      plotGear: 'Marcia',
      plotPedals: 'Pedali',
      plotSteer: 'Sterzo',
      plotWheels: 'Carico ruote (loadK)',
      readoutGas: 'Gas',
      readoutBrake: 'Freno',
      readoutClutch: 'Friz',
      readoutAvgLoad: 'Med loadK',
    },
    cornerTable: {
      title: 'Cordoli/apici (Vmin) e rettilinei (Vmax)',
      subtitle: '· clicca una riga per andare al punto',
      filterVmin: 'Curve (Vmin)',
      filterVmax: 'Rettilinei (Vmax)',
      filterAll: 'Tutti',
      empty: 'Nessun estremo di velocità (≥ 12 km/h) rilevato in questo giro.',
      colPoint: 'Punto',
      colDistance: 'Distanza',
      colPilotA: '[A] Pilota A',
      colPilotB: '[B] Pilota B',
      colSpeedDelta: 'Vel. Δ',
      colGear: 'Marcia (A | B)',
      colBrakePoint: 'Frenata (A | B)',
      colTimeLoss: 'Tempo Δ',
      colAction: 'Azione',
      typeApex: 'Apice',
      typeStraight: 'Vel. max',
      actionFocusTitle: 'Mostra su mappa',
      actionZoomTitle: 'Zoom sui grafici',
    },
    inspector: {
      empty: 'Carica un archivio .apex.zip per ispezionare manifesto e canali.',
      titlePrefix: 'Ispettore `.apex.zip` (schema v',
      fileLabel: 'File:',
      sessionLabel: 'Sessione:',
      recordedLabel: 'Registrato:',
      chunksLabel: 'Chunk:',
      metaHeader: 'Metadati manifesto e tracciato',
      driverLabel: 'Pilota:',
      carLabel: 'Auto:',
      remoteLabel: 'Remota:',
      provenanceLabel: 'Origine ruote:',
      trackLabel: 'Tracciato:',
      lengthLabel: 'Lunghezza:',
      splineLabel: 'Spline:',
      algoLabel: 'Bordi asfalto:',
      samplesLabel: 'Campioni |lat| > 0.15:',
      halfWidthLabel: 'Semilarghezza W(p):',
      widthApprox: 'largh. ≈',
      warningsHeader: 'Avvisi:',
      rawJsonHeaderPrefix: 'JSON `manifest.json`',
      rawJsonHeaderAndDump: ' e `dump_car.json`',
      coverageHeader: 'Copertura canali (`summary.coverage`)',
      sourceLabel: 'Fonte:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'calcolato dai frame',
      totalFramesLabel: 'Frame:',
      filterAll: 'Tutti',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Mancanti (null)',
      colChannelId: 'Canale',
      colScope: 'Ambito',
      colPresent: 'Presenti',
      colTotal: 'Totale',
      colCoverage: 'Copertura',
      colStatus: 'Stato',
      statusNull: '✖ null (non trasmesso dal gioco)',
      statusNetcode: '▲ netcode (estrapolazione remota)',
      statusRecorded: '● registrato da StateCar',
    },
    errors: {
      sampleLoadFailed: 'Errore caricamento campione',
      archiveReadFailed: 'Impossibile leggere archivio',
    },
  },

  fr: {
    common: {
      pilotA: 'PILOTE A',
      pilotAShort: 'Pilote A',
      pilotB: 'PILOTE B',
      pilotBShort: 'Pilote B',
      metersShort: 'm',
      secondsShort: 's',
      kmh: 'km/h',
      framesShort: 'fr.',
      framesFull: 'frames',
      newtonsShort: 'N',
      degShort: '°',
      gearShort: 'Rapport',
      close: 'Fermer',
      unknownCar: 'Voiture inconnue',
      remote: 'Distant',
      local: 'Local',
    },
    dropWorkspace: {
      title: 'Déposez une archive .apex.zip',
      subtitle: 'Glissez un ou deux fichiers .apex.zip pour comparer tours, trajectoires et télémétrie.',
      dropOrClick: 'Glissez .apex.zip ou cliquez',
      unpacking: 'Extraction de l’archive...',
    },
    header: {
      tabTelemetry: 'Télémétrie',
      tabInspector: 'Inspecteur d’archive',
      selectZip: 'Choisir .apex.zip',
      selectZipTitleA: 'Charger une archive pour Pilote A',
      selectZipTitleB: 'Charger une archive pour Pilote B',
      downloadZipTitle: 'Télécharger',
      clearSlotTitleA: 'Vider Pilote A',
      clearSlotTitleB: 'Vider Pilote B',
      lapLabel: 'Tour :',
      dropInlineA: 'Glissez .apex.zip ou cliquez (Pilote A)',
      dropInlineB: 'Glissez .apex.zip ou cliquez (Pilote B)',
      lapDelta: 'Delta du tour',
      swap: 'Inverser',
      swapTitle: 'Inverser Pilote A et Pilote B',
      waitingArchive: 'Aucune archive',
      resetTooltip: 'Téléportation aux stands (note="reset"). Trajectoire coupée.',
      langSwitchTitle: 'Langue',
    },
    lapStatus: {
      lapWord: 'Tour',
      partial: 'PARTIEL',
    },
    trackCanvas: {
      circuitFallback: 'Circuit',
      modeSpeed: 'Vitesse',
      modePedals: 'Pédales',
      modeDelta: 'Delta',
      vminVmaxTitle: 'Afficher / masquer Vmin et Vmax',
      surfaceBtn: 'Asphalte',
      surfaceTitle: 'Afficher / masquer les limites de piste',
      resetCanvasLabel: 'RESET',
      hudDistance: 'DIST :',
      hudGear: 'Rap :',
      zoomInTitle: 'Zoomer',
      zoomOutTitle: 'Dézoomer',
      expandSplitTitle: 'Vue en deux colonnes',
      expandFullTitle: 'Pleine largeur',
      resetViewTitle: 'Réinitialiser la vue',
      legendPilotA: '- - [A] Pilote A',
      legendPilotB: '━━ [B] Pilote B',
      legendSlow: 'Lent',
      legendMax: 'Max',
      legendThrottle: '■ Gaz',
      legendBrake: '■ Frein',
      legendCoast: '■ Roue libre',
      legendGain: '■ Gain',
      legendLoss: '■ Perte',
    },
    telemetryStack: {
      title: 'Canaux de télémétrie',
      subtitle: '· pas de 1 m · glissez ou utilisez la molette pour zoomer',
      fullLap: 'Tour complet',
      resetZoom: 'Reset',
      wheelsBtn: 'Roues (loadK)',
      wheelsTitle: 'Afficher / masquer la charge des roues',
      netcodeNotice: '▲ Voiture distante : données roues (`w.*`) extrapolées via netcode.',
      plotDelta: 'Delta-T',
      plotSpeed: 'Vitesse',
      plotGear: 'Rapport',
      plotPedals: 'Pédales',
      plotSteer: 'Volant',
      plotWheels: 'Charge roues (loadK)',
      readoutGas: 'Gaz',
      readoutBrake: 'Frn',
      readoutClutch: 'Emb',
      readoutAvgLoad: 'Moy loadK',
    },
    cornerTable: {
      title: 'Points de corde (Vmin) et lignes droites (Vmax)',
      subtitle: '· cliquez sur une ligne pour aller au point',
      filterVmin: 'Virages (Vmin)',
      filterVmax: 'Lignes droites (Vmax)',
      filterAll: 'Tous',
      empty: 'Aucun extremum de vitesse (≥ 12 km/h) détecté sur ce tour.',
      colPoint: 'Point',
      colDistance: 'Distance',
      colPilotA: '[A] Pilote A',
      colPilotB: '[B] Pilote B',
      colSpeedDelta: 'Vit. Δ',
      colGear: 'Rapport (A | B)',
      colBrakePoint: 'Freinage (A | B)',
      colTimeLoss: 'Temps Δ',
      colAction: 'Action',
      typeApex: 'Corde',
      typeStraight: 'Vitesse max',
      actionFocusTitle: 'Voir sur la carte',
      actionZoomTitle: 'Zoomer sur les graphes',
    },
    inspector: {
      empty: 'Chargez une archive .apex.zip pour inspecter le manifeste et les canaux.',
      titlePrefix: 'Inspecteur `.apex.zip` (schéma v',
      fileLabel: 'Fichier :',
      sessionLabel: 'Session :',
      recordedLabel: 'Enregistré :',
      chunksLabel: 'Chunks :',
      metaHeader: 'Métadonnées du manifeste et de la piste',
      driverLabel: 'Pilote :',
      carLabel: 'Voiture :',
      remoteLabel: 'Distante :',
      provenanceLabel: 'Source roues :',
      trackLabel: 'Circuit :',
      lengthLabel: 'Longueur :',
      splineLabel: 'Spline :',
      algoLabel: 'Limites asphalte :',
      samplesLabel: 'Échantillons |lat| > 0.15 :',
      halfWidthLabel: 'Demi-largeur W(p) :',
      widthApprox: 'largeur ≈',
      warningsHeader: 'Avertissements :',
      rawJsonHeaderPrefix: 'JSON `manifest.json`',
      rawJsonHeaderAndDump: ' et `dump_car.json`',
      coverageHeader: 'Couverture des canaux (`summary.coverage`)',
      sourceLabel: 'Source :',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'calculé depuis les frames',
      totalFramesLabel: 'Frames :',
      filterAll: 'Tous',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Manquants (null)',
      colChannelId: 'Canal',
      colScope: 'Portée',
      colPresent: 'Présent',
      colTotal: 'Total',
      colCoverage: 'Couverture',
      colStatus: 'Statut',
      statusNull: '✖ null (non transmis par le jeu)',
      statusNetcode: '▲ netcode (extrapolation distante)',
      statusRecorded: '● enregistré depuis StateCar',
    },
    errors: {
      sampleLoadFailed: 'Échec du chargement de l’exemple',
      archiveReadFailed: 'Impossible de lire l’archive',
    },
  },

  zh: {
    common: {
      pilotA: '车手 A',
      pilotAShort: '车手 A',
      pilotB: '车手 B',
      pilotBShort: '车手 B',
      metersShort: 'm',
      secondsShort: 's',
      kmh: 'km/h',
      framesShort: '帧',
      framesFull: '帧',
      newtonsShort: 'N',
      degShort: '°',
      gearShort: '挡位',
      close: '关闭',
      unknownCar: '未知车辆',
      remote: '远程',
      local: '本地',
    },
    dropWorkspace: {
      title: '拖入 .apex.zip 遥测归档',
      subtitle: '拖入一或两个 .apex.zip 文件，对比圈速、走线与遥测曲线。',
      dropOrClick: '拖入 .apex.zip 或点击选择',
      unpacking: '正在解压并插值遥测数据...',
    },
    header: {
      tabTelemetry: '遥测分析',
      tabInspector: '归档检查器',
      selectZip: '选择 .apex.zip',
      selectZipTitleA: '加载车手 A 归档',
      selectZipTitleB: '加载车手 B 归档',
      downloadZipTitle: '下载',
      clearSlotTitleA: '清空车手 A',
      clearSlotTitleB: '清空车手 B',
      lapLabel: '圈:',
      dropInlineA: '拖入 .apex.zip 或点击加载 (车手 A)',
      dropInlineB: '拖入 .apex.zip 或点击加载 (车手 B)',
      lapDelta: '圈速差',
      swap: '交换',
      swapTitle: '交换车手 A 与车手 B',
      waitingArchive: '等待归档',
      resetTooltip: '本圈包含回维修区事件 (note="reset")，轨迹已断开。',
      langSwitchTitle: '语言',
    },
    lapStatus: {
      lapWord: '第',
      partial: '不完整',
    },
    trackCanvas: {
      circuitFallback: '赛道',
      modeSpeed: '速度',
      modePedals: '踏板',
      modeDelta: '时差',
      vminVmaxTitle: '显示 / 隐藏 Vmin 与 Vmax 标记',
      surfaceBtn: '路面',
      surfaceTitle: '显示 / 隐藏赛道边界',
      resetCanvasLabel: 'RESET',
      hudDistance: '距离:',
      hudGear: '挡:',
      zoomInTitle: '放大',
      zoomOutTitle: '缩小',
      expandSplitTitle: '双栏视图',
      expandFullTitle: '全宽地图',
      resetViewTitle: '重置视图',
      legendPilotA: '- - [A] 车手 A',
      legendPilotB: '━━ [B] 车手 B',
      legendSlow: '慢',
      legendMax: '快',
      legendThrottle: '■ 油门',
      legendBrake: '■ 刹车',
      legendCoast: '■ 滑行',
      legendGain: '■ 获益',
      legendLoss: '■ 损失',
    },
    telemetryStack: {
      title: '同步遥测通道',
      subtitle: '· 1 m 步进 · 拖拽框选或滚轮缩放',
      fullLap: '整圈',
      resetZoom: '重置',
      wheelsBtn: '轮胎载荷 (loadK)',
      wheelsTitle: '显示 / 隐藏轮胎载荷曲线',
      netcodeNotice: '▲ 远程车辆：轮胎数据 (`w.*`) 来自网络同步插值 (netcode)。',
      plotDelta: 'Delta-T (时差)',
      plotSpeed: '速度',
      plotGear: '挡位',
      plotPedals: '踏板',
      plotSteer: '方向盘转角',
      plotWheels: '轮胎载荷 (loadK)',
      readoutGas: '油门',
      readoutBrake: '刹车',
      readoutClutch: '离合',
      readoutAvgLoad: '平均 loadK',
    },
    cornerTable: {
      title: '弯心 (Vmin) 与直道尾速 (Vmax)',
      subtitle: '· 点击行跳转到对应位置',
      filterVmin: '弯道 (Vmin)',
      filterVmax: '直道 (Vmax)',
      filterAll: '全部',
      empty: '当前圈未检测到速度极值点 (≥ 12 km/h)。',
      colPoint: '位置',
      colDistance: '距离',
      colPilotA: '[A] 车手 A',
      colPilotB: '[B] 车手 B',
      colSpeedDelta: '速度差',
      colGear: '挡位 (A | B)',
      colBrakePoint: '刹车点 (A | B)',
      colTimeLoss: '时间差',
      colAction: '操作',
      typeApex: '弯心',
      typeStraight: '尾速',
      actionFocusTitle: '在地图定位',
      actionZoomTitle: '在图表放大',
    },
    inspector: {
      empty: '请加载 .apex.zip 归档以查看清单与通道覆盖率。',
      titlePrefix: '归档结构 `.apex.zip` (schema v',
      fileLabel: '文件:',
      sessionLabel: '会话:',
      recordedLabel: '时间:',
      chunksLabel: '分块:',
      metaHeader: '清单与赛道重建元数据',
      driverLabel: '车手:',
      carLabel: '车辆:',
      remoteLabel: '远程车辆:',
      provenanceLabel: '轮胎数据来源:',
      trackLabel: '赛道:',
      lengthLabel: '赛道长度:',
      splineLabel: '中心线:',
      algoLabel: '边界算法:',
      samplesLabel: '|lat| > 0.15 采样:',
      halfWidthLabel: '中位半宽 W(p):',
      widthApprox: '总宽 ≈',
      warningsHeader: '解析警告:',
      rawJsonHeaderPrefix: '原始 `manifest.json`',
      rawJsonHeaderAndDump: ' 与 `dump_car.json`',
      coverageHeader: '通道覆盖率 (`summary.coverage`)',
      sourceLabel: '来源:',
      sourceSummary: 'summary.json',
      sourceRecomputed: '按帧重新计算',
      totalFramesLabel: '总帧数:',
      filterAll: '全部',
      filterFrame: '车体 (f.*)',
      filterWheel: '四轮 (w.*)',
      filterMissing: '缺失 (null)',
      colChannelId: '通道 ID',
      colScope: '范围',
      colPresent: '有效帧',
      colTotal: '总计',
      colCoverage: '覆盖率',
      colStatus: '状态',
      statusNull: '✖ null (游戏未上报，不替换为 0)',
      statusNetcode: '▲ netcode (远程车辆网络外推)',
      statusRecorded: '● 记录自 StateCar',
    },
    errors: {
      sampleLoadFailed: '加载示例失败',
      archiveReadFailed: '读取归档失败',
    },
  },

  ja: {
    common: {
      pilotA: 'ドライバー A',
      pilotAShort: 'ドライバー A',
      pilotB: 'ドライバー B',
      pilotBShort: 'ドライバー B',
      metersShort: 'm',
      secondsShort: 's',
      kmh: 'km/h',
      framesShort: 'fr.',
      framesFull: 'フレーム',
      newtonsShort: 'N',
      degShort: '°',
      gearShort: 'ギア',
      close: '閉じる',
      unknownCar: '不明な車両',
      remote: 'リモート',
      local: 'ローカル',
    },
    dropWorkspace: {
      title: '.apex.zip テレメトリをドロップ',
      subtitle: '1つまたは2つの .apex.zip をドロップして、ラップ・走行ライン・テレメトリを比較します。',
      dropOrClick: '.apex.zip をドロップまたは選択',
      unpacking: 'アーカイブを展開中...',
    },
    header: {
      tabTelemetry: 'テレメトリ',
      tabInspector: 'アーカイブ詳細',
      selectZip: '.apex.zip を選択',
      selectZipTitleA: 'ドライバー A のアーカイブを読み込む',
      selectZipTitleB: 'ドライバー B のアーカイブを読み込む',
      downloadZipTitle: 'ダウンロード',
      clearSlotTitleA: 'ドライバー A をクリア',
      clearSlotTitleB: 'ドライバー B をクリア',
      lapLabel: 'ラップ:',
      dropInlineA: '.apex.zip をドロップまたは選択 (A)',
      dropInlineB: '.apex.zip をドロップまたは選択 (B)',
      lapDelta: 'ラップデルタ',
      swap: '入替',
      swapTitle: 'ドライバー A と B を入れ替え',
      waitingArchive: 'データなし',
      resetTooltip: 'ピットへのテレポート (note="reset") により軌跡が分割されています。',
      langSwitchTitle: '言語',
    },
    lapStatus: {
      lapWord: 'Lap',
      partial: '不完全',
    },
    trackCanvas: {
      circuitFallback: 'コース',
      modeSpeed: '車速',
      modePedals: 'ペダル',
      modeDelta: 'デルタ',
      vminVmaxTitle: 'Vmin / Vmax ラベルの表示切替',
      surfaceBtn: 'コース幅',
      surfaceTitle: 'アスファルト境界の表示切替',
      resetCanvasLabel: 'RESET',
      hudDistance: '距離:',
      hudGear: 'G:',
      zoomInTitle: '拡大',
      zoomOutTitle: '縮小',
      expandSplitTitle: '2カラム表示',
      expandFullTitle: 'マップ全幅表示',
      resetViewTitle: '表示リセット',
      legendPilotA: '- - [A] ドライバー A',
      legendPilotB: '━━ [B] ドライバー B',
      legendSlow: '低速',
      legendMax: '最高速',
      legendThrottle: '■ アクセル',
      legendBrake: '■ ブレーキ',
      legendCoast: '■ コースト',
      legendGain: '■ ゲイン',
      legendLoss: '■ ロス',
    },
    telemetryStack: {
      title: 'テレメトリグラフ',
      subtitle: '· 1 m 刻み · ドラッグまたはホイールでズーム',
      fullLap: '全区間',
      resetZoom: 'リセット',
      wheelsBtn: '輪荷重 (loadK)',
      wheelsTitle: '輪荷重グラフの表示切替',
      netcodeNotice: '▲ リモート車両: タイヤデータ (`w.*`) は netcode 補間値です。',
      plotDelta: 'Delta-T',
      plotSpeed: '車速',
      plotGear: 'ギア',
      plotPedals: 'ペダル',
      plotSteer: '舵角',
      plotWheels: '輪荷重 (loadK)',
      readoutGas: 'Thr',
      readoutBrake: 'Brk',
      readoutClutch: 'Clu',
      readoutAvgLoad: '平均 loadK',
    },
    cornerTable: {
      title: 'エイペックス (Vmin) & ストレート (Vmax)',
      subtitle: '· 行をクリックして地点へジャンプ',
      filterVmin: 'コーナー (Vmin)',
      filterVmax: 'ストレート (Vmax)',
      filterAll: 'すべて',
      empty: 'このラップでは速度極値 (≥ 12 km/h) が検出されませんでした。',
      colPoint: '地点',
      colDistance: '距離',
      colPilotA: '[A] ドライバー A',
      colPilotB: '[B] ドライバー B',
      colSpeedDelta: '速度差',
      colGear: 'ギア (A | B)',
      colBrakePoint: 'ブレーキ開始 (A | B)',
      colTimeLoss: 'タイム差',
      colAction: '操作',
      typeApex: 'Apex',
      typeStraight: '最高速',
      actionFocusTitle: 'マップで表示',
      actionZoomTitle: 'グラフを拡大',
    },
    inspector: {
      empty: '.apex.zip を読み込むとマニフェストとチャンネル網羅率を表示します。',
      titlePrefix: 'アーカイブ詳細 `.apex.zip` (schema v',
      fileLabel: 'ファイル:',
      sessionLabel: 'セッション:',
      recordedLabel: '記録日時:',
      chunksLabel: 'チャンク:',
      metaHeader: 'マニフェスト & コース復元メタデータ',
      driverLabel: 'ドライバー:',
      carLabel: '車両:',
      remoteLabel: 'リモート:',
      provenanceLabel: 'タイヤ由来:',
      trackLabel: 'コース:',
      lengthLabel: 'コース長:',
      splineLabel: 'スプライン:',
      algoLabel: 'コース境界算出:',
      samplesLabel: '|lat| > 0.15 サンプル:',
      halfWidthLabel: '中央値半幅 W(p):',
      widthApprox: '全幅 ≈',
      warningsHeader: '警告:',
      rawJsonHeaderPrefix: 'JSON `manifest.json`',
      rawJsonHeaderAndDump: ' & `dump_car.json`',
      coverageHeader: 'チャンネル網羅率 (`summary.coverage`)',
      sourceLabel: 'ソース:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'フレームから再計算',
      totalFramesLabel: '総フレーム:',
      filterAll: 'すべて',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: '欠損 (null)',
      colChannelId: 'チャンネル',
      colScope: 'スコープ',
      colPresent: '記録数',
      colTotal: '総数',
      colCoverage: '網羅率',
      colStatus: 'ステータス',
      statusNull: '✖ null (未出力 — 0 置換なし)',
      statusNetcode: '▲ netcode (リモート補間)',
      statusRecorded: '● StateCar から記録',
    },
    errors: {
      sampleLoadFailed: 'サンプルの読み込みに失敗しました',
      archiveReadFailed: 'アーカイブの読み込みに失敗しました',
    },
  },
};

export type TranslationsDict = TranslationsShape;

/**
 * Formats a ParsedLap label dynamically in the active language.
 */
export function formatLocalizedLapLabel(lap: ParsedLap, lang: Language): string {
  const dict = translations[lang].lapStatus;
  const timeStr = formatLapTime(lap.durationMs);
  const statusSuffix = lap.hasReset
    ? ' [RESET]'
    : lap.isValid === false
    ? ` [CUTS: ${lap.cuts ?? '?'}]`
    : !lap.isComplete && lap.frames.length < 100
    ? ` [${dict.partial}]`
    : '';
  if (lang === 'zh') {
    return `第 ${lap.lapNumber} 圈 — ${timeStr}${statusSuffix}`;
  }
  return `${dict.lapWord} ${lap.lapNumber} — ${timeStr}${statusSuffix}`;
}

/**
 * Translates parser warnings that may have been generated in the worker.
 */
export function localizeParserWarning(warning: string, lang: Language): string {
  if (lang === 'ru') return warning;
  return warning
    .replace(
      'manifest.track.spline === false: сплайн трассы отсутствует в архиве.',
      'manifest.track.spline === false: track spline is absent from archive.'
    )
    .replace(
      'track.json содержит вырожденные точки (все точки совпадают) и был проигнорирован.',
      'track.json contains degenerate points (all points identical) and was ignored.'
    )
    .replace('Не удалось прочитать track.json:', 'Failed to read track.json:')
    .replace('Файл track.json отсутствует в архиве.', 'track.json file is missing from the archive.')
    .replace(/Чанки начинаются с (\d+), ожидался 0001\./, 'Chunks start at $1, expected 0001.')
    .replace(/Пропуск в нумерации чанков: (\d+) -> (\d+)/, 'Gap in chunk numbering: $1 -> $2')
    .replace(
      /Поврежденная строка JSON в ([^:]+):(\d+) \(пропущена\)/,
      'Malformed JSON line in $1:$2 (skipped)'
    )
    .replace('Ошибка чтения summary.json:', 'Error reading summary.json:')
    .replace(
      'summary.json отсутствует (запись была прервана нештатно). Покрытие каналов вычислено автоматически по фреймам.',
      'summary.json is absent (unclean stop). Coverage was computed automatically from frames.'
    );
}

/**
 * Translates worker/parser error messages into the active language.
 */
export function localizeErrorMessage(err: string, lang: Language): string {
  if (lang === 'ru') return err;
  const archiveReadPrefix = translations[lang].errors.archiveReadFailed;
  const sampleLoadPrefix = translations[lang].errors.sampleLoadFailed;
  return err
    .replace(
      /Не удалось прочитать архив "([^"]+)":/,
      `${archiveReadPrefix} "$1":`
    )
    .replace(
      /В архиве "([^"]+)" отсутствует обязательный файл manifest\.json/,
      'Archive "$1" is missing required manifest.json'
    )
    .replace(
      /В архиве "([^"]+)" не найдено ни одного чанка frames\/NNNN\.ndjson/,
      'Archive "$1" contains no frames/NNNN.ndjson chunks'
    )
    .replace('Ошибка загрузки тестового сэмпла:', `${sampleLoadPrefix}:`);
}

interface I18nContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslationsDict;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => detectInitialLanguage());

  const setLang = useCallback((nextLang: Language) => {
    setLangState(nextLang);
    try {
      localStorage.setItem(STORAGE_KEY, nextLang);
    } catch {
      // Ignore storage write errors
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const value: I18nContextValue = {
    lang,
    setLang,
    t: translations[lang],
  };

  return React.createElement(I18nContext.Provider, { value }, children);
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
