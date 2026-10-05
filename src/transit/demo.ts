import type { FavoriteRoute, Timetable, Trip } from './types';
/** Synthetic schedule, deliberately never represented as actual Oedo service. */
export function demoTimetable(now = Date.now()): Timetable {
  const trips: Trip[] = [];
  for (let time = 6 * 3600, i = 0; time <= 25 * 3600; time += 6 * 60, i++) {
    for (const direction of ['0', '1'] as const) {
      const ids = direction === '0' ? ['demo-nerima', 'demo-shinjuku'] : ['demo-shinjuku', 'demo-nerima'];
      trips.push({ id: `demo-${direction}-${i}`, routeId: 'demo-oedo', serviceId: 'demo-daily', direction,
        headsign: direction === '0' ? '新宿（架空）' : '練馬春日町（架空）', kind: 'サンプル',
        stops: ids.map((stopId, n) => ({ stopId, sequence: n + 1, arrival: time + n * 21 * 60, departure: time + n * 21 * 60, pickup: true, dropoff: true })) });
    }
  }
  return { schema: 1, id: 'demo', title: '架空の大江戸線テストデータ', source: 'このプロジェクトで作成した架空のダイヤ', license: 'CC0 (synthetic test data)',
    timezone: 'Asia/Tokyo', importedAt: now, demo: true,
    stations: [{ id: 'demo-nerima', name: '練馬春日町' }, { id: 'demo-shinjuku', name: '新宿' }],
    lines: [{ id: 'demo-oedo', name: '大江戸線（架空）' }], trips,
    calendars: [{ id: 'demo-daily', start: '20200101', end: '20991231', days: [true, true, true, true, true, true, true] }], exceptions: [], transfers: [] };
}
export function demoFavorites(): FavoriteRoute[] {
  return ['0', '1'].map(direction => ({ id: `demo-fav-${direction}`, name: direction === '0' ? '行き（サンプル）' : '帰り（サンプル）',
    from: direction === '0' ? 'demo-nerima' : 'demo-shinjuku', to: direction === '0' ? 'demo-shinjuku' : 'demo-nerima',
    lineIds: ['demo-oedo'], direction: direction as '0' | '1', via: [], walkingMinutes: 7, bufferMinutes: 2, transferMinutes: 4,
    days: [0, 1, 2, 3, 4, 5, 6], preferredLines: [], excludedLines: [], fixedPath: [], maxTransfers: 0 }));
}
