import protobuf from 'protobufjs';
import schema from './gtfs/gtfs-realtime.proto?raw';
import type { RealtimeUpdate, Timetable } from './types';
import { serviceDates, serviceRuns } from './timetable';
import { serviceMidnight } from '../utils/time';
import { boundedResponse, publicHttpsUrl } from './gtfs/loader';
const messageType = protobuf.parse(schema).root.lookupType('transit_realtime.FeedMessage');
interface EventTime { delay?: number; time?: number | string }
interface StopUpdate { stopId?: string; stopSequence?: number; scheduleRelationship?: number; departure?: EventTime; arrival?: EventTime }
interface TripUpdate { trip?: { tripId?: string; startDate?: string; scheduleRelationship?: number }; timestamp?: number | string; delay?: number; stopTimeUpdate?: StopUpdate[] }
interface Feed { header?: { timestamp?: number | string; incrementality?: number }; entity?: { tripUpdate?: TripUpdate }[] }
export function decodeRealtime(bytes: Uint8Array, data: Timetable, now: number): { updates: RealtimeUpdate[]; warnings: string[] } {
  if (bytes.length > 2 * 1024 * 1024) throw new Error('Realtime feedが大きすぎます');
  const feed = messageType.toObject(messageType.decode(bytes), { longs: String }) as Feed;
  if (!feed.header) throw new Error('Realtime headerがありません');
  if (feed.header.incrementality === 1) throw new Error('差分Realtime feedは未対応です');
  const feedTime = Number(feed.header.timestamp) * 1000;
  if (!Number.isFinite(feedTime) || now - feedTime > 120_000 || feedTime > now + 30_000) throw new Error('Realtime feedが古いか時刻が不正です');
  const updates: RealtimeUpdate[] = [], warnings: string[] = [];
  for (const entity of feed.entity ?? []) {
    const u = entity.tripUpdate, descriptor = u?.trip;
    if (!u || !descriptor?.tripId) continue;
    const trip = data.trips.find(t => t.id === descriptor.tripId);
    if (!trip) { warnings.push('時刻表と一致しない列車を無視しました'); continue; }
    const relationship = descriptor.scheduleRelationship ?? 0;
    if (![0, 3, 7].includes(relationship)) { warnings.push('臨時・変更列車は未対応です'); continue; }
    let serviceDate = descriptor.startDate;
    if (!serviceDate) {
      const firstTime = trip.stops.find(s => s.departure !== null)?.departure;
      const lastStop = [...trip.stops].reverse().find(s => s.arrival !== null || s.departure !== null);
      const lastTime = lastStop?.arrival ?? lastStop?.departure;
      if (firstTime === null || firstTime === undefined || lastTime === null || lastTime === undefined) continue;
      const candidates = serviceDates(now).filter(d => serviceRuns(data, trip.serviceId, d)
        && serviceMidnight(d) + firstTime * 1000 - 7_200_000 <= now
        && now <= serviceMidnight(d) + lastTime * 1000 + 7_200_000);
      if (candidates.length !== 1) { warnings.push('運行日を特定できないRealtimeを無視しました'); continue; }
      serviceDate = candidates[0];
    }
    serviceMidnight(serviceDate);
    const updatedAt = u.timestamp === undefined ? feedTime : Number(u.timestamp) * 1000;
    if (!Number.isFinite(updatedAt) || now - updatedAt > 120_000 || updatedAt > now + 30_000) continue;
    const common = { tripId: trip.id, serviceDate, updatedAt };
    if (relationship === 3 || relationship === 7) { updates.push({ ...common, canceled: true }); continue; }
    if (u.delay !== undefined && Number.isFinite(u.delay)) updates.push({ ...common, delaySeconds: u.delay });
    for (const stop of u.stopTimeUpdate ?? []) {
      if (stop.stopSequence === undefined && !stop.stopId) continue;
      if (stop.scheduleRelationship === 3 || stop.scheduleRelationship === 4 || stop.scheduleRelationship === 5) {
        warnings.push('変更停車駅は未対応です'); continue;
      }
      // NO_DATA explicitly resets propagation instead of keeping a previous delay.
      const noData = stop.scheduleRelationship === 2;
      const seconds = (value: number | string | undefined): number | undefined => {
        if (value === undefined) return undefined;
        const number = Number(value); return Number.isFinite(number) ? number * 1000 : undefined;
      };
      updates.push({ ...common, stopId: stop.stopId, stopSequence: stop.stopSequence,
        skipped: stop.scheduleRelationship === 1,
        delaySeconds: noData ? 0 : stop.departure?.delay ?? stop.arrival?.delay,
        arrivalDelaySeconds: noData ? 0 : stop.arrival?.delay,
        departureTime: noData ? undefined : seconds(stop.departure?.time),
        arrivalTime: noData ? undefined : seconds(stop.arrival?.time) });
    }
  }
  return { updates, warnings: [...new Set(warnings)] };
}
export async function fetchRealtime(url: string, origins: string[], data: Timetable, now: number): Promise<ReturnType<typeof decodeRealtime>> {
  publicHttpsUrl(url, origins);
  const response = await fetch(url, { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Realtime取得失敗 (${response.status})`);
  return decodeRealtime(new Uint8Array(await boundedResponse(response, 2 * 1024 * 1024)), data, now);
}
