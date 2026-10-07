import { expect, it } from 'vitest';
import { findJourneys } from '../src/transit/routing';
import { pastDepartures, selectNextDepartures, recommendedDeparture } from '../src/transit/departureSelector';
import { hudModel } from '../src/even/renderer';
import { data, trip, favorite, time } from './fixtures';
it('過去60分の発車と未到着便だけを復元し、未来のおすすめに混ぜない', () => {
  const d = data([trip('edge', [['A','12:43'],['B','14:00']]), trip('old', [['A','12:42'],['B','14:00']]),
    trip('arrived', [['A','13:00'],['B','13:43']]), trip('past', [['A','13:40'],['B','14:01']]), trip('next', [['A','13:54'],['B','14:15']])]);
  const now = time('13:43'), f = favorite();
  const result = findJourneys(d, f, now, [], 60);
  const history = pastDepartures(result, now), future = selectNextDepartures(result, now, 7, 2);
  expect(history.map(d => d.journey.legs[0].tripId)).toEqual(['edge','past']);
  expect(history.every(d => !d.reachable)).toBe(true);
  expect(recommendedDeparture(future)?.journey.legs[0].tripId).toBe('next');
  expect(findJourneys(d, f, now).every(j => j.legs[0].departure >= now)).toBe(true);
  const selected = history[1], model = hudModel(d, f, [...history, ...future], selected.journey.id, now, '');
  expect(model.action).toContain('乗車済み'); expect(model.primary).toContain('3分前');
  expect(hudModel(d, f, future, null, now, '', selected).action).toContain('で降車');
});
it('履歴検索でも現在時刻でRealtimeを判定し、運休を復元しない', () => {
  const d = data([trip('past', [['A','13:40'],['B','14:01']])]), now = time('13:43');
  const canceled = [{ tripId:'past', serviceDate:'20261005', canceled:true, updatedAt:now - 30000 }];
  expect(pastDepartures(findJourneys(d, favorite(), now, canceled, 60), now)).toEqual([]);
  const delay = [{ tripId:'past', serviceDate:'20261005', delaySeconds:60, updatedAt:now - 30000 }];
  expect(pastDepartures(findJourneys(d, favorite(), now, delay, 60), now)[0].departureTime).toBe(time('13:41'));
});
it('前日の24時以降の便も実時間で巻き戻せる', () => {
  const d = data([trip('night', [['A','24:01'],['B','24:30']])]), now = time('00:05','20261006');
  const history = pastDepartures(findJourneys(d, favorite(), now, [], 60), now);
  expect(history).toHaveLength(1); expect(history[0].journey.legs[0].serviceDate).toBe('20261005');
});
