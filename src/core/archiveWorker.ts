import { parseApexZipBuffer, ParsedApexArchive } from './parser';
import { splitArchiveIntoLaps, selectBestDefaultLap, ParsedLap } from './lapSplitter';

export interface ArchiveWorkerRequest {
  id: number;
  fileName: string;
  buffer: ArrayBuffer;
}

export interface ArchiveWorkerSuccessResponse {
  id: number;
  ok: true;
  result: {
    archive: ParsedApexArchive;
    laps: ParsedLap[];
    selectedLapNum: number;
  };
}

export interface ArchiveWorkerErrorResponse {
  id: number;
  ok: false;
  error: string;
}

export type ArchiveWorkerResponse = ArchiveWorkerSuccessResponse | ArchiveWorkerErrorResponse;

self.onmessage = async (event: MessageEvent<ArchiveWorkerRequest>) => {
  const { id, fileName, buffer } = event.data;
  try {
    const archive = await parseApexZipBuffer(fileName, buffer);
    const laps = splitArchiveIntoLaps(archive);
    const selectedLapNum = selectBestDefaultLap(laps);

    const response: ArchiveWorkerSuccessResponse = {
      id,
      ok: true,
      result: {
        archive,
        laps,
        selectedLapNum,
      },
    };
    self.postMessage(response);
  } catch (err) {
    const response: ArchiveWorkerErrorResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
