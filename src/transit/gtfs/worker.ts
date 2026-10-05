import { parseGtfsZip } from './parser';
self.onmessage = (event: MessageEvent) => {
  try { self.postMessage({ data: parseGtfsZip(new Uint8Array(event.data.bytes), event.data.meta) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'GTFS取込失敗' }); }
};
