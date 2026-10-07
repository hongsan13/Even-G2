import { findJourneys } from './routing';
import type { Timetable } from './types';
let data: Timetable;
self.onmessage = ({ data: request }: MessageEvent) => {
  try {
    if (request.data) data = request.data;
    self.postMessage({ id: request.id, journeys: findJourneys(data, request.favorite, request.now, request.updates, request.lookbackMinutes ?? 0) });
  } catch (error) {
    self.postMessage({ id: request.id, error: error instanceof Error ? error.message : '経路検索に失敗しました' });
  }
};
