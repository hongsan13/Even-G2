import { describe, it, expect } from 'vitest';
import { data, favorite, time, trip } from './fixtures';
import { findJourneys, transferSeconds } from '../src/transit/routing';
import { selectNextDepartures, recommendedDeparture } from '../src/transit/departureSelector';
import { serviceRuns, dataExpired } from '../src/transit/timetable';
import { jstDate, jstWeekday, clock, addDays, parseServiceTime, inWindow } from '../src/utils/time';
import { manualTimetable } from '../src/transit/manual';
import { autoFavorite, emptySettings } from '../src/state/store';
describe('乗車可否', () => {
  it('徒歩7分+余裕2分の境界でちょうど間に合う', () => {
    const departures = selectNextDepartures(findJourneys(data(), favorite(), time('13:43')), time('13:43'), 7, 2);
    expect(departures.slice(0, 3).map(d => d.departureTime)).toEqual([time('13:52'), time('13:58'), time('14:04')]);
    expect(departures[0]).toMatchObject({ reachable: true, status: 'TIGHT', minutesUntilDeparture: 9 });
    expect(selectNextDepartures([departures[0].journey], time('13:43') + 1, 7, 2)[0].status).toBe('MISSED');
  });
  it('SAFE / LEAVE_NOW / TIGHT / MISSEDを色なしで分類できる', () => {
    const journeys = findJourneys(data(), favorite(), time('13:40'));
    expect(['13:38', '13:41', '13:43', '13:44'].map(t => selectNextDepartures(journeys, time(t), 7, 2)[0].status))
      .toEqual(['SAFE', 'LEAVE_NOW', 'TIGHT', 'MISSED']);
  });
  it('徒歩0分と30分', () => {
    const journeys = findJourneys(data(), favorite(), time('13:40'));
    expect(selectNextDepartures(journeys, time('13:40'), 0, 0)[0].reachable).toBe(true);
    expect(selectNextDepartures(journeys, time('13:40'), 30, 0)[0].reachable).toBe(false);
  });
  it('負の設定を拒否する', () => expect(() => selectNextDepartures([], 0, -1, 0)).toThrow());
  it('同時刻の列車を落とさず保持する', () => {
    const d = data([trip('a', [['A', '13:52'], ['B', '14:13']]), trip('b', [['A', '13:52'], ['B', '14:12']])]);
    const result = selectNextDepartures(findJourneys(d, favorite(), time('13:43')), time('13:43'), 7, 2);
    expect(result[0].journey.legs[0].tripId).toBe('b'); expect(result[1].journey.legs[0].tripId).toBe('a');
  });
});
describe('運行日・日本時間', () => {
  it('23:59発 → 翌日00:05着 / 前営業日の25時台', () => {
    const d = data([trip('midnight', [['A', '23:59'], ['B', '24:05']]), trip('late', [['A', '25:00'], ['B', '25:10']])]);
    const result = findJourneys(d, favorite(), time('23:58'));
    expect(clock(result[0].arrival)).toBe('00:05'); expect(jstDate(result[0].arrival)).toBe('20261006');
    expect(findJourneys(d, favorite(), time('00:59', '20261006'))[0].legs[0].serviceDate).toBe('20261005');
  });
  it('平日・土曜・日曜・祝日のcalendar_dates例外', () => {
    const d = data(); d.calendars[0].days = [false, true, true, true, true, true, false];
    expect(serviceRuns(d, 'daily', '20261005')).toBe(true);
    expect(serviceRuns(d, 'daily', '20261010')).toBe(false);
    expect(serviceRuns(d, 'daily', '20261011')).toBe(false);
    d.exceptions = [{ serviceId: 'daily', date: '20261012', added: false }, { serviceId: 'daily', date: '20261011', added: true }];
    expect(serviceRuns(d, 'daily', '20261012')).toBe(false); expect(serviceRuns(d, 'daily', '20261011')).toBe(true);
  });
  it('始発前と終電後を区別し、翌日の始発を返す', () => {
    const d = data([trip('first', [['A', '06:00'], ['B', '06:20']]), trip('last', [['A', '23:50'], ['B', '24:10']])]);
    expect(clock(findJourneys(d, favorite(), time('05:00'))[0].legs[0].departure)).toBe('06:00');
    const next = findJourneys(d, favorite(), time('23:51'))[0];
    expect(jstDate(next.legs[0].departure)).toBe('20261006'); expect(clock(next.legs[0].departure)).toBe('06:00');
  });
  it('DSTの日でもJSTを固定し、ホストtimezoneに依存しない', () => {
    expect(clock(Date.parse('2026-03-08T07:05:00Z'))).toBe('16:05');
    expect(clock(Date.parse('2026-11-01T06:05:00Z'))).toBe('15:05');
    expect(addDays('20261231', 1)).toBe('20270101'); expect(jstWeekday('20261005')).toBe(1);
  });
  it('不正な日付・時刻を拒否', () => {
    expect(() => time('00:00', '20260230')).toThrow(); expect(() => parseServiceTime('24:60:00')).toThrow();
  });
  it('時刻表の有効期限を検出', () => { const d = data(); d.validUntil = '20261004'; expect(dataExpired(d, time('12:00'))).toBe(true); });
});
describe('乗換・遅延・運休', () => {
  const d = data([trip('first', [['A', '13:40'], ['B', '13:51']]), trip('tight', [['B', '13:54'], ['C', '14:06']], 'L2'), trip('second', [['B', '13:56'], ['C', '14:08']], 'L2')]);
  it('4分乗換では13:54を除外し、13:56を選ぶ', () => {
    const result = findJourneys(d, favorite({ to: 'C', maxTransfers: 1 }), time('13:30'))[0];
    expect(result.transfers).toBe(1); expect(result.legs[1].tripId).toBe('second'); expect(clock(result.arrival)).toBe('14:08');
  });
  it('明示的な乗換最低時間と禁止を反映', () => {
    expect(transferSeconds({ ...d, transfers: [{ from: 'B', to: 'B', seconds: 360, prohibited: false }] }, 'B', 'B')).toBe(360);
    expect(transferSeconds({ ...d, transfers: [{ from: 'B', to: 'B', seconds: 0, prohibited: true }] }, 'B', 'B')).toBeNull();
  });
  it('1本目の遅延で乗換に間に合わなくなる', () => {
    const now = time('13:30');
    const result = findJourneys(d, favorite({ to: 'C', maxTransfers: 1 }), now,
      [{ tripId: 'first', serviceDate: '20261005', delaySeconds: 300, updatedAt: now }]);
    expect(result.some(j => j.legs[0].serviceDate === '20261005')).toBe(false);
  });
  it('運休を除外、遅延を補正、古いRealtimeは予定へ戻す', () => {
    const timetable = data(), now = time('13:43');
    const updates = [{ tripId: 't1', serviceDate: '20261005', canceled: true, updatedAt: now }, { tripId: 't2', serviceDate: '20261005', delaySeconds: 300, updatedAt: now }];
    const result = findJourneys(timetable, favorite(), now, updates);
    expect(result[0].legs[0].tripId).toBe('t2'); expect(clock(result[0].legs[0].departure)).toBe('14:03');
    expect(clock(findJourneys(timetable, favorite(), now + 121000, updates)[0].legs[0].departure)).toBe('13:52');
  });
  it('途中駅のarrival-only遅延を到着へ反映', () => {
    const timetable = data(), now = time('13:43');
    expect(findJourneys(timetable, favorite(), now, [{ tripId: 't1', serviceDate: '20261005', stopId: 'B', arrivalDelaySeconds: 180, updatedAt: now }])[0].arrival).toBe(time('14:16'));
  });
  it('経由・禁止路線・固定経路', () => {
    expect(findJourneys(d, favorite({ to: 'C', maxTransfers: 1, via: ['B'], fixedPath: ['L1', 'L2'] }), time('13:30'))[0].legs).toHaveLength(2);
    expect(findJourneys(d, favorite({ to: 'C', maxTransfers: 1, excludedLines: ['L2'] }), time('13:30'))).toHaveLength(0);
  });
});
describe('自動切替・手入力', () => {
  it('手動が当日は優先、翌日に自動が復帰', () => {
    const f = favorite({ auto: { days: [1], start: '07:00', end: '10:00' } });
    const s = { ...emptySettings(), activeId: 'other', favorites: [f] };
    expect(autoFavorite(s, time('08:00'), '20261005')).toBe('other'); expect(autoFavorite(s, time('08:00'), null)).toBe('fav');
    expect(inWindow(time('23:30'), '22:00', '01:00')).toBe(true);
  });
  it('手入力の土休日と祝日を明示的に切り替える', () => {
    const d = manualTimetable({ from: 'A', to: 'B', line: 'L', source: '公式時刻表を確認', duration: 21, start: '20260101', end: '20261231', forwardWeekday: '13:52 24:05', forwardWeekend: '13:58', returnWeekday: '', returnWeekend: '', holidays: '20261012' });
    expect(d.demo).toBe(false); expect(serviceRuns(d, 'weekday', '20261012')).toBe(false); expect(serviceRuns(d, 'weekend', '20261012')).toBe(true);
    expect(d.trips[1].stops[0].departure).toBe(24 * 3600 + 5 * 60);
  });
});
it('乗換駅指定は別の乗換駅を除外し、直通は引き続き許可', () => {
  const timetable = data([trip('first', [['A', '13:40'], ['B', '13:50'], ['D', '14:00']]), trip('second', [['B', '13:55'], ['C', '14:10']], 'L2'), trip('third', [['D', '14:05'], ['C', '14:20']], 'L2')]);
  const result = findJourneys(timetable, favorite({ to: 'C', transferAt: 'D', maxTransfers: 1 }), time('13:30'));
  expect(result[0].legs[1].from).toBe('D'); expect(result[0].arrival).toBe(time('14:20'));
});

it('あとに出る速い便がある場合は、乗車可能な最速到着を推奨', () => {
  const timetable = data([trip('slow', [['A', '13:52'], ['B', '14:30']]), trip('fast', [['A', '13:58'], ['B', '14:10']])]);
  const departures = selectNextDepartures(findJourneys(timetable, favorite(), time('13:43')), time('13:43'), 7, 2);
  expect(recommendedDeparture(departures)?.journey.legs[0].tripId).toBe('fast');
  expect(departures[0].journey.legs[0].tripId).toBe('slow');
});
describe('2回乗換', () => {
  const timetable = () => {
    const d = data([trip('first', [['A', '13:40'], ['B', '13:50']]), trip('middle', [['B', '13:54'], ['C', '14:04']], 'L2'), trip('tight', [['C', '14:07'], ['D', '14:15']], 'L3'), trip('last', [['C', '14:08'], ['D', '14:20']], 'L3')]);
    d.lines.push({ id: 'L3', name: 'L3' }); return d;
  };
  const f = favorite({ to: 'D', maxTransfers: 2 });
  it('3本の列車をつなぎ、両方の乗換で余裕を満たす便を選ぶ', () => {
    const result = findJourneys(timetable(), f, time('13:30'))[0];
    expect(result.transfers).toBe(2); expect(result.legs.map(l => l.tripId)).toEqual(['first', 'middle', 'last']);
    expect(result.arrival).toBe(time('14:20'));
    expect(findJourneys(timetable(), { ...f, maxTransfers: 1 }, time('13:30'))).toEqual([]);
  });
  it('2回目の乗換にも明示的な最低時間・禁止を適用', () => {
    const d = timetable(); d.transfers = [{ from: 'C', to: 'C', seconds: 300, prohibited: false }];
    expect(findJourneys(d, f, time('13:30'))).toEqual([]);
    d.transfers = [{ from: 'C', to: 'C', seconds: 0, prohibited: true }];
    expect(findJourneys(d, f, time('13:30'))).toEqual([]);
  });
  it('中間便・最終便の運休や遅延でつながらない経路を除外', () => {
    const now = time('13:30');
    for (const tripId of ['middle', 'last']) expect(findJourneys(timetable(), f, now, [{ tripId, serviceDate: '20261005', canceled: true, updatedAt: now }]).some(j => j.legs[0].serviceDate === '20261005')).toBe(false);
    expect(findJourneys(timetable(), f, now, [{ tripId: 'middle', serviceDate: '20261005', delaySeconds: 60, updatedAt: now }]).some(j => j.legs[0].serviceDate === '20261005')).toBe(false);
  });
  it('順番付きの経由駅・3路線の固定経路・除外路線を守る', () => {
    const result = findJourneys(timetable(), { ...f, via: ['B', 'C'], fixedPath: ['L1', 'L2', 'L3'], transferAt: 'B' }, time('13:30'));
    expect(result[0].legs).toHaveLength(3);
    expect(findJourneys(timetable(), { ...f, via: ['C', 'B'] }, time('13:30'))).toEqual([]);
    expect(findJourneys(timetable(), { ...f, excludedLines: ['L2'] }, time('13:30'))).toEqual([]);
    expect(findJourneys(timetable(), { ...f, transferAt: 'C' }, time('13:30'))).toEqual([]);
  });
  it('後発の速い最終便も調べ、到着同時なら少ない乗換を選ぶ', () => {
    const d = timetable(); d.trips.push(trip('fast', [['C', '14:09'], ['D', '14:12']], 'L3'));
    expect(findJourneys(d, f, time('13:30'))[0].legs[2].tripId).toBe('fast');
    d.trips[0].stops.push({ stopId: 'D', sequence: 3, arrival: 14 * 3600 + 12 * 60, departure: 14 * 3600 + 12 * 60, pickup: true, dropoff: true });
    expect(findJourneys(d, f, time('13:30'))[0].transfers).toBe(0);
  });
  it('24時を越える2回乗換を同じ営業日として扱う', () => {
    const d = data([trip('first', [['A', '23:50'], ['B', '23:55']]), trip('middle', [['B', '23:59'], ['C', '24:05']], 'L2'), trip('last', [['C', '24:09'], ['D', '24:20']], 'L3')]);
    d.lines.push({ id: 'L3', name: 'L3' });
    const result = findJourneys(d, f, time('23:40'))[0];
    expect(result.legs).toHaveLength(3); expect(result.arrival).toBe(time('24:20')); expect(result.legs.every(l => l.serviceDate === '20261005')).toBe(true);
  });
});
it('2つ目の乗換駅を指定した場合は、その駅での3区間経路を選ぶ', () => {
  const d = data([trip('first', [['A', '13:40'], ['B', '13:50']]), trip('middle', [['B', '13:54'], ['C', '14:04']], 'L2'), trip('last', [['C', '14:08'], ['D', '14:20']], 'L3')]);
  d.lines.push({ id: 'L3', name: 'L3' });
  expect(findJourneys(d, favorite({ to: 'D', maxTransfers: 2, transferAt: 'B', secondTransferAt: 'C' }), time('13:30'))[0].transfers).toBe(2);
  expect(findJourneys(d, favorite({ to: 'D', maxTransfers: 2, secondTransferAt: 'B' }), time('13:30'))).toEqual([]);
});
