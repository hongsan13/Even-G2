import { parseOdpt } from './parser';
self.onmessage = event => {
  try {
    const { railways, stations, trains, meta } = event.data;
    const decode = (s: string) => JSON.parse(s.replace(/^\uFEFF/, ''));
    self.postMessage({ data: parseOdpt(decode(railways), decode(stations), decode(trains), meta) });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'JSON取込に失敗しました' }); }
};
