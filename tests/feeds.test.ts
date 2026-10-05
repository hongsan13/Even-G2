import { expect, it } from 'vitest';
import { data, favorite, time } from './fixtures';
import { mergeFeeds, putFeed, savedFeeds } from '../src/transit/feeds';
import { findJourneys } from '../src/transit/routing';
import { applyEdits, retainEdits } from '../src/transit/edits';
const feed = (feedId: string) => ({ feedId, data: data(), checkedAt: 0 });
it('配布元が同じ駅・列車・路線IDでも衝突せず検索できる', () => {
  const cache = mergeFeeds([feed('one'), feed('two')]);
  expect(cache.data.stations).toHaveLength(8);
  expect(new Set(cache.data.trips.map(t => t.id)).size).toBe(6);
  const journeys = findJourneys(cache.data, favorite({ from: 'two::A', to: 'two::B' }), time('13:40'));
  expect(journeys[0].legs[0].tripId).toBe('two::t1');
  expect(findJourneys(cache.data, favorite({ from: 'one::A', to: 'two::B', maxTransfers: 1 }), time('13:40'))).toEqual([]);
});
it('配布元の更新は別地域を保持しIDも変えない', () => {
  const cache = mergeFeeds([feed('one'), feed('two')]);
  const next = feed('one'); next.data.version = 'new';
  const result = putFeed(cache, next);
  expect(savedFeeds(result).map(f => f.feedId)).toEqual(['two', 'one']);
  expect(result.data.trips.some(t => t.id === 'one::t1')).toBe(true);
  expect(savedFeeds(result).find(f => f.feedId === 'one')?.data.version).toBe('new');
});
it('旧形式は駅IDを維持して移行し、既存のお気に入りを壊さない', () => {
  const result = mergeFeeds(savedFeeds({ data: data(), checkedAt: 0 }));
  expect(result.data.stations[0].id).toBe('A');
  expect(findJourneys(result.data, favorite(), time('13:40'))[0].legs[0].tripId).toBe('t1');
});
it('登録上限・重複配布元を拒否', () => {
  expect(() => mergeFeeds(Array.from({ length: 9 }, (_, i) => feed(String(i))))).toThrow('8件');
  expect(() => mergeFeeds([feed('x'), feed('x')])).toThrow('重複');
});
it('端末内の時刻補正は元データを書き換えず、検索へ反映', () => {
  const original = data();
  const edit = { tripId: 't1', stops: original.trips[0].stops.map(s => ({ sequence: s.sequence, arrival: s.arrival! + 60, departure: s.departure! + 60 })) };
  const changed = applyEdits(original, [edit]);
  expect(findJourneys(changed, favorite(), time('13:40'))[0].legs[0].departure).toBe(time('13:53'));
  expect(original.trips[0].stops[0].departure).not.toBe(changed.trips[0].stops[0].departure);
  expect(retainEdits({ ...original, trips: [] }, [edit])).toEqual([]);
});
it('逆転した時刻・別の停車順を補正として保存しない', () => {
  const original = data();
  const stops = original.trips[0].stops.map(s => ({ sequence: s.sequence, arrival: s.arrival, departure: s.departure }));
  stops[1].arrival = stops[0].arrival! - 60;
  expect(() => applyEdits(original, [{ tripId: 't1', stops }])).toThrow('順序');
  expect(() => applyEdits(original, [{ tripId: 't1', stops: [] }])).toThrow('停車順');
});
it('別配布元の乗換は確認した徒歩連絡を登録した場合だけ検索する', () => {
  const first = feed('one'), second = feed('two');
  first.data.trips[0].stops[0].arrival = first.data.trips[0].stops[0].departure = 13 * 3600 + 40 * 60;
  first.data.trips[0].stops[1].arrival = first.data.trips[0].stops[1].departure = 13 * 3600 + 50 * 60;
  second.data.trips[0].stops[0].arrival = second.data.trips[0].stops[0].departure = 13 * 3600 + 55 * 60;
  const f = favorite({ from: 'one::A', to: 'two::B', maxTransfers: 1, transferAt: 'one::B' });
  const cache = mergeFeeds([first, second], [{ from: 'one::B', to: 'two::A', seconds: 300, prohibited: false }]);
  expect(findJourneys(cache.data, f, time('13:30'))[0].legs[1].from).toBe('two::A');
  expect(() => mergeFeeds([first, second], [{ from: 'one::B', to: 'two::A', seconds: -1, prohibited: false }])).toThrow('徒歩時間');
});
it('一部の配布元が期限切れならその列車だけ除外し、他地域を止めない', () => {
  const first = feed('one'), second = feed('two'); first.data.validUntil = '20261004';
  const cache = mergeFeeds([first, second]);
  expect(findJourneys(cache.data, favorite({ from: 'one::A', to: 'one::B' }), time('13:30'))).toEqual([]);
  expect(findJourneys(cache.data, favorite({ from: 'two::A', to: 'two::B' }), time('13:30')).length).toBeGreaterThan(0);
});
