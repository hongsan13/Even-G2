import { describe, it, expect } from 'vitest';
import protobuf from 'protobufjs';
import schema from '../src/transit/gtfs/gtfs-realtime.proto?raw';
import { decodeRealtime } from '../src/transit/realtime';
import { findJourneys } from '../src/transit/routing';
import { data, favorite, time } from './fixtures';
const Feed = protobuf.parse(schema).root.lookupType('transit_realtime.FeedMessage');
const now = time('13:43');
function encode(entities: object[], header: object = {}): Uint8Array {
  return Feed.encode(Feed.create({ header: { gtfsRealtimeVersion: '2.0', timestamp: now / 1000, ...header }, entity: entities })).finish();
}
describe('公式GTFS-Realtime protobuf', () => {
  it('停車駅の時刻・遅延と運休をdecodeして検索に適用', () => {
    const bytes = encode([
      { id: '1', tripUpdate: { trip: { tripId: 't1', startDate: '20261005' }, stopTimeUpdate: [{ stopSequence: 1, departure: { delay: 300 } }, { stopSequence: 2, arrival: { delay: 180 } }] } },
      { id: '2', tripUpdate: { trip: { tripId: 't2', startDate: '20261005', scheduleRelationship: 3 } } },
    ]);
    const result = decodeRealtime(bytes, data(), now);
    const journeys = findJourneys(data(), favorite(), now, result.updates);
    expect(journeys[0].legs[0].departure).toBe(time('13:57')); expect(journeys[0].arrival).toBe(time('14:16'));
    expect(journeys.some(j => j.legs[0].tripId === 't2' && j.legs[0].serviceDate === '20261005')).toBe(false);
  });
  it('絶対時刻とNO_DATAによる遅延伝播のリセット', () => {
    const bytes = encode([{ id: '1', tripUpdate: { trip: { tripId: 't1', startDate: '20261005' }, delay: 300,
      stopTimeUpdate: [{ stopSequence: 1, departure: { time: time('13:57') / 1000 } }, { stopSequence: 2, scheduleRelationship: 2 }] } }]);
    const updates = decodeRealtime(bytes, data(), now).updates;
    expect(findJourneys(data(), favorite(), now, updates)[0].arrival).toBe(time('14:13'));
  });
  it('stale feed・未来のfeed・DIFFERENTIALを拒否', () => {
    expect(() => decodeRealtime(encode([], { timestamp: (now - 121_000) / 1000 }), data(), now)).toThrow('古い');
    expect(() => decodeRealtime(encode([], { timestamp: (now + 60_000) / 1000 }), data(), now)).toThrow('時刻');
    expect(() => decodeRealtime(encode([], { incrementality: 1 }), data(), now)).toThrow('差分');
  });
  it('停車駅スキップを対象にしない', () => {
    const updates = decodeRealtime(encode([{ id: '1', tripUpdate: { trip: { tripId: 't1', startDate: '20261005' }, stopTimeUpdate: [{ stopSequence: 1, scheduleRelationship: 1 }] } }]), data(), now).updates;
    expect(findJourneys(data(), favorite(), now, updates)[0].legs[0].tripId).toBe('t2');
  });
  it('不明な列車・変更列車を推測しない', () => {
    const result = decodeRealtime(encode([{ id: '1', tripUpdate: { trip: { tripId: 'missing' } } }, { id: '2', tripUpdate: { trip: { tripId: 't1', startDate: '20261005', scheduleRelationship: 1 } } }]), data(), now);
    expect(result.updates).toHaveLength(0); expect(result.warnings).toHaveLength(2);
  });
  it('start_dateを省略した通常便は運行日が一意な場合だけ補完', () => {
    const result = decodeRealtime(encode([{ id: '1', tripUpdate: { trip: { tripId: 't1' }, delay: 120 } }]), data(), now);
    expect(result.updates[0].serviceDate).toBe('20261005');
  });
  it('arrival-only絶対時刻の遅延を次の停車駅へ伝播', () => {
    const d = data();
    const result = decodeRealtime(encode([{ id: '1', tripUpdate: { trip: { tripId: 't1', startDate: '20261005' },
      stopTimeUpdate: [{ stopSequence: 1, arrival: { time: time('13:55') / 1000 } }] } }]), d, now);
    const j = findJourneys(d, favorite(), now, result.updates)[0];
    expect(j.legs[0].departure).toBe(time('13:55')); expect(j.arrival).toBe(time('14:16'));
  });
});
