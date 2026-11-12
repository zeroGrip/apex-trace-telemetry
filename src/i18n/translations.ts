import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { ParsedLap, formatLapTime } from '../core/lapSplitter';

export type Language = 'en' | 'ru';

const STORAGE_KEY = 'apex_trace_lang';

/**
 * Detects initial language from localStorage or browser settings.
 * Defaults to 'en' unless the browser language explicitly starts with 'ru'.
 */
export function detectInitialLanguage(): Language {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ru') {
      return saved;
    }
  } catch {
    // Ignore storage access issues
  }

  if (typeof navigator !== 'undefined') {
    const primaryLang =
      (Array.isArray(navigator.languages) && navigator.languages[0]) ||
      navigator.language ||
      '';
    if (primaryLang.toLowerCase().startsWith('ru')) {
      return 'ru';
    }
  }

  return 'en';
}

export const translations = {
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
      unknownCar: 'Unknown Car',
      remote: 'Remote',
      local: 'Local',
    },
    dropWorkspace: {
      title: 'Drop .apex.zip Telemetry Archive',
      subtitlePart1: 'Drag and drop one or two ',
      subtitlePart2: ' files anywhere in the window (or into the slots below) for client-side unpacking via ',
      subtitlePart3: ', 2D track boundary reconstruction, and synchronized telemetry analysis.',
      dropOrClick: 'Drop .apex.zip here or click to browse file',
      unpacking: 'Unpacking archive and interpolating telemetry...',
    },
    header: {
      tabTelemetry: 'Telemetry',
      tabInspector: 'Archive Inspector',
      selectZip: 'Select .apex.zip',
      selectZipTitleA: 'Select or drop .apex.zip archive for Pilot A',
      selectZipTitleB: 'Select or drop .apex.zip archive for Pilot B',
      downloadZipTitle: 'Download this archive (.apex.zip)',
      clearSlotTitleA: 'Clear Pilot A slot',
      clearSlotTitleB: 'Clear Pilot B slot',
      lapLabel: 'Lap:',
      dropInlineA: 'Drop .apex.zip here or click to load Pilot A',
      dropInlineB: 'Drop .apex.zip here or click to load Pilot B',
      lapDelta: 'Lap Delta',
      swap: 'Swap',
      swapTitle: 'Swap Pilot A and Pilot B',
      waitingArchive: 'Waiting for archive',
      resetTooltip: "This lap contains a note='reset' event (teleport to pits). Trajectory polyline is broken.",
      langSwitchTitle: 'Switch interface language (English / Русский)',
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
      vminVmaxTitle: 'Show / hide Vmin and Vmax callout badges on corners and straights',
      surfaceBtn: 'Surface',
      surfaceTitle: 'Show / hide reconstructed asphalt boundaries',
      resetCanvasLabel: '✖ RESET (Trajectory Break)',
      hudDistance: 'DISTANCE:',
      hudGear: 'Gear:',
      zoomInTitle: 'Zoom in map',
      zoomOutTitle: 'Zoom out map',
      expandSplitTitle: 'Return map and charts to side-by-side layout',
      expandFullTitle: 'Expand map to full width (vertical layout)',
      resetViewTitle: 'Reset zoom and center circuit',
      legendPilotA: '- - [A] Pilot A (dashed)',
      legendPilotB: '━━ [B] Pilot B (solid)',
      legendSlow: 'Slow',
      legendMax: 'Max',
      legendThrottle: '■ Throttle',
      legendBrake: '■ Brake',
      legendCoast: '■ Coast',
      legendGain: '■ Gain',
      legendLoss: '■ Loss',
    },
    telemetryStack: {
      title: 'Synchronized Telemetry Stack',
      subtitle: '· Grid step: 1 m · Drag across chart or scroll wheel to zoom',
      fullLap: 'Full Lap',
      resetZoom: 'Reset',
      wheelsBtn: 'Wheels (loadK)',
      wheelsTitle: 'Show / hide wheel load chart (loadK)',
      netcodeNotice:
        '▲ Note (0001-recording-is-what-the-game-reported): for remote cars, `w.*` is marked with `provenance.wheels = "netcode"` (network packet extrapolation).',
      plotDelta: 'Delta-T (Time Loss / Gain)',
      plotSpeed: 'Speed (Velocity)',
      plotGear: 'Gear (Step-wise)',
      plotPedals: 'Inputs (Throttle / Brake / Clutch)',
      plotSteer: 'Steer (Steering Wheel Angle)',
      plotWheels: 'Wheel Load & Slip (Avg loadK)',
      readoutGas: 'Thr',
      readoutBrake: 'Brk',
      readoutClutch: 'Clu',
      readoutAvgLoad: 'Avg loadK',
    },
    cornerTable: {
      title: 'Corner Apexes (Vmin) & Straights (Vmax) Summary',
      subtitle: '· Click any row to jump to that point on the map and charts',
      filterVmin: 'Corners (Vmin)',
      filterVmax: 'Straights (Vmax)',
      filterAll: 'All Points',
      empty:
        'No local speed extrema with hysteresis ≥ 12 km/h detected in the selected lap (a short test snippet may be loaded).',
      colPoint: 'Point',
      colDistance: 'Distance',
      colPilotA: '[A] Pilot A',
      colPilotB: '[B] Pilot B',
      colSpeedDelta: 'Speed Δ',
      colGear: 'Gear (A | B)',
      colBrakePoint: 'Braking Point (A | B)',
      colTimeLoss: 'Time Loss',
      colAction: 'Action',
      typeApex: 'Apex',
      typeStraight: 'Max Speed',
      actionFocusTitle: 'Move cursor to this point',
      actionZoomTitle: 'Zoom into this corner on telemetry charts',
    },
    inspector: {
      empty: 'Load at least one .apex.zip archive to inspect manifest structure and channel coverage.',
      titlePrefix: 'Archive Structure Inspector `.apex.zip` (Schema v',
      fileLabel: 'File:',
      sessionLabel: 'Session:',
      recordedLabel: 'Recorded:',
      chunksLabel: 'Chunks:',
      metaHeader: 'Metadata `manifest.json` & Track Surface Reconstruction',
      driverLabel: 'Driver (target.driverName):',
      carLabel: 'Car (target.carModel):',
      remoteLabel: 'Remote Car (isRemote):',
      provenanceLabel: 'Provenance (wheels):',
      trackLabel: 'Track (track.name):',
      lengthLabel: 'Track Length (track.lengthM):',
      splineLabel: 'Spline (track.spline):',
      algoLabel: 'Asphalt Boundary Algorithm:',
      samplesLabel: 'Samples |lateral| > 0.15:',
      halfWidthLabel: 'Median Half-Width W(p):',
      widthApprox: 'width ≈',
      warningsHeader: 'Parser Warnings:',
      rawJsonHeaderPrefix: 'Contents of `manifest.json`',
      rawJsonHeaderAndDump: ' and `dump_car.json`',
      coverageHeader: 'Channel Coverage Matrix (`summary.coverage` · Null is not Zero)',
      sourceLabel: 'Source:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'recomputed from frames',
      totalFramesLabel: 'Total frames:',
      filterAll: 'All Channels',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Missing (null)',
      colChannelId: 'Channel ID',
      colScope: 'Scope',
      colPresent: 'Present',
      colTotal: 'Total',
      colCoverage: 'Coverage %',
      colStatus: 'Status / Provenance',
      statusNull: '✖ null (Game did not report channel — not replaced with 0)',
      statusNetcode: '▲ netcode (Network extrapolation of remote car)',
      statusRecorded: '● Recorded from StateCar packet',
    },
    errors: {
      sampleLoadFailed: 'Failed to load test sample',
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
      unknownCar: 'Unknown Car',
      remote: 'Remote',
      local: 'Local',
    },
    dropWorkspace: {
      title: 'Перетащите архив телеметрии .apex.zip',
      subtitlePart1: 'Перетащите один или сразу два файла ',
      subtitlePart2: ' в любую область окна (или в слоты ниже) для распаковки на клиенте через ',
      subtitlePart3: ', построения 2D-карты границ трассы и синхронного анализа графиков.',
      dropOrClick: 'Перетащите .apex.zip сюда или нажмите для выбора файла',
      unpacking: 'Распаковка архива и интерполяция телеметрии...',
    },
    header: {
      tabTelemetry: 'Телеметрия',
      tabInspector: 'Инспектор Архива',
      selectZip: 'Выбрать .apex.zip',
      selectZipTitleA: 'Выбрать или перетащить архив .apex.zip для Пилота А',
      selectZipTitleB: 'Выбрать или перетащить архив .apex.zip для Пилота Б',
      downloadZipTitle: 'Скачать этот архив (.apex.zip)',
      clearSlotTitleA: 'Очистить слот Пилота А',
      clearSlotTitleB: 'Очистить слот Пилота Б',
      lapLabel: 'Круг:',
      dropInlineA: 'Перетащите .apex.zip сюда или нажмите для загрузки Пилота А',
      dropInlineB: 'Перетащите .apex.zip сюда или нажмите для загрузки Пилота Б',
      lapDelta: 'Дельта круга',
      swap: 'Поменять',
      swapTitle: 'Поменять местами Пилота А и Пилота Б',
      waitingArchive: 'Ожидание архива',
      resetTooltip: "В этом круге зафиксировано событие note='reset' (телепорт в боксы). Линия траектории разорвана.",
      langSwitchTitle: 'Переключить язык интерфейса (English / Русский)',
    },
    lapStatus: {
      lapWord: 'Круг',
      partial: 'ЧАСТИЧНЫЙ',
    },
    trackCanvas: {
      circuitFallback: 'Circuit',
      modeSpeed: 'Скорость',
      modePedals: 'Педали',
      modeDelta: 'Дельта',
      vminVmaxTitle: 'Показать / скрыть выноски Vmin и Vmax на поворотах и прямых',
      surfaceBtn: 'Полотно',
      surfaceTitle: 'Показать / скрыть восстановленные границы асфальта',
      resetCanvasLabel: '✖ RESET (Разрыв траектории)',
      hudDistance: 'ДИСТАНЦИЯ:',
      hudGear: 'Пер:',
      zoomInTitle: 'Приблизить карту',
      zoomOutTitle: 'Отдалить карту',
      expandSplitTitle: 'Вернуть карту и графики в два столбца',
      expandFullTitle: 'Развернуть карту на весь экран по ширине (вертикальная верстка)',
      resetViewTitle: 'Сбросить масштаб и центрировать трассу',
      legendPilotA: '- - [A] Пилот А (пунктир)',
      legendPilotB: '━━ [B] Пилот Б (сплошная)',
      legendSlow: 'Медленно',
      legendMax: 'Макс',
      legendThrottle: '■ Газ',
      legendBrake: '■ Тормоз',
      legendCoast: '■ Накат',
      legendGain: '■ Отыгрыш',
      legendLoss: '■ Потеря',
    },
    telemetryStack: {
      title: 'Синхронизированный Стек Телеметрии',
      subtitle: '· Шаг сетки: 1 м · Выделите область мышью или крутите колесико для зума',
      fullLap: 'Весь круг',
      resetZoom: 'Сброс',
      wheelsBtn: 'Колеса (loadK)',
      wheelsTitle: 'Показать / скрыть график нагрузки на колеса (loadK)',
      netcodeNotice:
        '▲ Примечание (0001-recording-is-what-the-game-reported): для удаленных машин блок `w.*` помечен как `provenance.wheels = "netcode"` (экстраполяция сетевого пакета).',
      plotDelta: 'Delta-T (Потеря / Отыгрыш времени)',
      plotSpeed: 'Speed (Скорость)',
      plotGear: 'Gear (Передача — ступенчатый)',
      plotPedals: 'Inputs (Газ / Тормоз / Сцепление)',
      plotSteer: 'Steer (Угол поворота руля)',
      plotWheels: 'Wheel Load & Slip (Нагрузка loadK ср.)',
      readoutGas: 'Газ',
      readoutBrake: 'Торм',
      readoutClutch: 'Сцепл',
      readoutAvgLoad: 'Ср. loadK',
    },
    cornerTable: {
      title: 'Сводная Таблица Апексов (Vmin) и Прямых (Vmax)',
      subtitle: '· Нажмите на строку для перехода к точке на карте и графиках',
      filterVmin: 'Повороты (Vmin)',
      filterVmax: 'Прямые (Vmax)',
      filterAll: 'Все точки',
      empty:
        'В выбранном круге не обнаружено локальных экстремумов скорости с гистерезисом ≥ 12 км/ч (возможно, загружен короткий тестовый фрагмент).',
      colPoint: 'Точка',
      colDistance: 'Дистанция',
      colPilotA: '[A] Пилот А',
      colPilotB: '[B] Пилот Б',
      colSpeedDelta: 'Разница V',
      colGear: 'Передача (A | B)',
      colBrakePoint: 'Точка торможения (A | B)',
      colTimeLoss: 'Потеря времени',
      colAction: 'Действие',
      typeApex: 'Апекс',
      typeStraight: 'Макс. разгон',
      actionFocusTitle: 'Навести курсор на эту точку',
      actionZoomTitle: 'Приблизить этот поворот на графиках телеметрии',
    },
    inspector: {
      empty: 'Загрузите хотя бы один архив .apex.zip для просмотра структуры манифеста и покрытия каналов.',
      titlePrefix: 'Инспектор Структуры Архива `.apex.zip` (Schema v',
      fileLabel: 'Файл:',
      sessionLabel: 'Сессия:',
      recordedLabel: 'Записано:',
      chunksLabel: 'Чанков:',
      metaHeader: 'Метаданные `manifest.json` и Восстановления Полотна Трассы',
      driverLabel: 'Пилот (target.driverName):',
      carLabel: 'Автомобиль (target.carModel):',
      remoteLabel: 'Удаленная машина (isRemote):',
      provenanceLabel: 'Provenance (wheels):',
      trackLabel: 'Трасса (track.name):',
      lengthLabel: 'Длина трека (track.lengthM):',
      splineLabel: 'Сплайн (track.spline):',
      algoLabel: 'Алгоритм границ асфальта:',
      samplesLabel: 'Замеров |lateral| > 0.15:',
      halfWidthLabel: 'Медианная полуширина W(p):',
      widthApprox: 'ширина ≈',
      warningsHeader: 'Предупреждения парсера:',
      rawJsonHeaderPrefix: 'Содержимое `manifest.json`',
      rawJsonHeaderAndDump: ' и `dump_car.json`',
      coverageHeader: 'Матрица Покрытия Каналов (`summary.coverage` · Null is not Zero)',
      sourceLabel: 'Источник:',
      sourceSummary: 'summary.json',
      sourceRecomputed: 'пересчет по фреймам',
      totalFramesLabel: 'Всего фреймов:',
      filterAll: 'Все каналы',
      filterFrame: 'Frame (f.*)',
      filterWheel: 'Wheels (w.*)',
      filterMissing: 'Пропуски (null)',
      colChannelId: 'ID Канала',
      colScope: 'Область',
      colPresent: 'Present',
      colTotal: 'Total',
      colCoverage: 'Покрытие %',
      colStatus: 'Статус / Происхождение',
      statusNull: '✖ null (Игра не передала канал — не заменено на 0)',
      statusNetcode: '▲ netcode (Сетевая экстраполяция удаленной машины)',
      statusRecorded: '● Записано из пакета StateCar',
    },
    errors: {
      sampleLoadFailed: 'Ошибка загрузки тестового сэмпла',
      archiveReadFailed: 'Не удалось прочитать архив',
    },
  },
} as const;

export type TranslationsDict = (typeof translations)[Language];

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
      'summary.json is absent (recording stopped uncleanly). Channel coverage was computed automatically from frames.'
    );
}

/**
 * Translates worker/parser error messages into the active language.
 */
export function localizeErrorMessage(err: string, lang: Language): string {
  if (lang === 'ru') return err;
  return err
    .replace(
      /Не удалось прочитать архив "([^"]+)":/,
      'Failed to read archive "$1":'
    )
    .replace(
      /В архиве "([^"]+)" отсутствует обязательный файл manifest\.json/,
      'Archive "$1" is missing required manifest.json file'
    )
    .replace(
      /В архиве "([^"]+)" не найдено ни одного чанка frames\/NNNN\.ndjson/,
      'Archive "$1" contains no frames/NNNN.ndjson chunks'
    )
    .replace('Ошибка загрузки тестового сэмпла:', 'Failed to load test sample:');
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
