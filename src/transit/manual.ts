import type { Timetable, Trip, FavoriteRoute } from './types';
import { parseServiceTime, serviceMidnight } from '../utils/time';
export interface ManualInput {
  from: string; to: string; line: string; source: string; duration: number; start: string; end: string;
  forwardWeekday: string; forwardWeekend: string; returnWeekday: string; returnWeekend: string; holidays: string;
}
export function manualTimetable(input: ManualInput, now = Date.now()): Timetable {
  serviceMidnight(input.start); serviceMidnight(input.end);
  if (input.end < input.start || !Number.isFinite(input.duration) || input.duration <= 0 || input.duration > 240
    || ![input.from, input.to, input.line, input.source].every(t => t.trim().length > 0 && t.length <= 200)
    || input.from === input.to) throw new Error('駅・路線・所要時間・有効期間・出典を確認してください');
  const trips: Trip[] = [];
  for (const [text, direction, serviceId] of [
    [input.forwardWeekday, '0', 'weekday'], [input.forwardWeekend, '0', 'weekend'],
    [input.returnWeekday, '1', 'weekday'], [input.returnWeekend, '1', 'weekend'],
  ] as const) {
    for (const [i, time] of text.trim().split(/[\s,、]+/).filter(Boolean).entries()) {
      const departure = parseServiceTime(time.length <= 5 ? `${time}:00` : time);
      if (departure + input.duration * 60 > 72 * 3600 - 1) throw new Error('72時間を超える到着時刻は未対応です');
      const ids = direction === '0' ? ['manual-from', 'manual-to'] : ['manual-to', 'manual-from'];
      trips.push({ id: `${direction}-${serviceId}-${i}`, routeId: 'manual-line', direction, serviceId,
        headsign: direction === '0' ? input.to : input.from,
        stops: ids.map((stopId, n) => ({ stopId, sequence: n + 1, arrival: departure + n * input.duration * 60,
          departure: departure + n * input.duration * 60, pickup: true, dropoff: true })) });
    }
  }
  if (!trips.length || trips.length > 4000) throw new Error('発車時刻は1〜4000本で入力してください');
  const holidays = [...new Set(input.holidays.trim().split(/[\s,、]+/).filter(Boolean).map(d => { serviceMidnight(d); return d; }))];
  return { schema: 1, id: crypto.randomUUID(), title: `${input.line}（手入力）`, source: input.source,
    license: 'ユーザー個人利用の手入力（再配布不可）', timezone: 'Asia/Tokyo', importedAt: now, demo: false, validUntil: input.end,
    stations: [{ id: 'manual-from', name: input.from }, { id: 'manual-to', name: input.to }],
    lines: [{ id: 'manual-line', name: input.line }], trips,
    calendars: [{ id: 'weekday', start: input.start, end: input.end, days: [false, true, true, true, true, true, false] },
      { id: 'weekend', start: input.start, end: input.end, days: [true, false, false, false, false, false, true] }],
    exceptions: holidays.flatMap(date => [{ date, serviceId: 'weekday', added: false }, { date, serviceId: 'weekend', added: true }]), transfers: [] };
}
export function manualFavorites(): FavoriteRoute[] {
  return ['0', '1'].map(direction => ({ id: `manual-fav-${direction}`, name: direction === '0' ? '行き' : '帰り',
    from: direction === '0' ? 'manual-from' : 'manual-to', to: direction === '0' ? 'manual-to' : 'manual-from',
    lineIds: ['manual-line'], direction: direction as '0' | '1', via: [], walkingMinutes: 7, bufferMinutes: 2, transferMinutes: 4,
    days: [0, 1, 2, 3, 4, 5, 6], preferredLines: [], excludedLines: [], fixedPath: [], maxTransfers: 0 }));
}
