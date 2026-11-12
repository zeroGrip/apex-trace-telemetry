import ArchiveWorker from './archiveWorker?worker&inline';
import type {
  ArchiveWorkerRequest,
  ArchiveWorkerResponse,
  ArchiveWorkerSuccessResponse,
} from './archiveWorker';
import { parseApexZipBuffer } from './parser';
import { splitArchiveIntoLaps, selectBestDefaultLap } from './lapSplitter';

type ParsedSessionPayload = ArchiveWorkerSuccessResponse['result'];

interface PendingJob {
  resolve: (value: ParsedSessionPayload) => void;
  reject: (reason: Error) => void;
}

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pendingJobs = new Map<number, PendingJob>();

function getOrCreateWorker(): Worker | null {
  if (typeof Worker === 'undefined') {
    return null;
  }
  if (!workerInstance) {
    workerInstance = new ArchiveWorker();
    workerInstance.onmessage = (event: MessageEvent<ArchiveWorkerResponse>) => {
      const msg = event.data;
      const job = pendingJobs.get(msg.id);
      if (!job) return;
      pendingJobs.delete(msg.id);

      if (msg.ok === true) {
        job.resolve(msg.result);
      } else {
        job.reject(new Error(msg.error));
      }
    };
    workerInstance.onerror = (err) => {
      const error = new Error(err.message || 'Ошибка выполнения Web Worker');
      for (const [, job] of pendingJobs) {
        job.reject(error);
      }
      pendingJobs.clear();
    };
  }
  return workerInstance;
}

/**
 * Unpacks an .apex.zip ArrayBuffer, parses all NDJSON chunks, and splits into laps
 * inside an inlined Web Worker using zero-copy ArrayBuffer transfer.
 * Compatible with static deployments (including GitHub Pages with base './').
 */
export async function parseZipInWorker(
  fileName: string,
  buffer: ArrayBuffer
): Promise<ParsedSessionPayload> {
  const worker = getOrCreateWorker();

  if (!worker) {
    // Fallback if Web Workers are unavailable
    const archive = await parseApexZipBuffer(fileName, buffer);
    const laps = splitArchiveIntoLaps(archive);
    const selectedLapNum = selectBestDefaultLap(laps);
    return { archive, laps, selectedLapNum };
  }

  const id = nextRequestId++;
  return new Promise<ParsedSessionPayload>((resolve, reject) => {
    pendingJobs.set(id, { resolve, reject });
    const request: ArchiveWorkerRequest = { id, fileName, buffer };
    // Transfer ArrayBuffer ownership zero-copy to the Worker thread
    worker.postMessage(request, [buffer]);
  });
}
