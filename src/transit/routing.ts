import type { FavoriteRoute, Journey, Timetable, RealtimeUpdate, TransitLeg, Trip } from './types';
import { leg, freshRealtime, serviceDates, serviceRuns, SEARCH_HORIZON } from './timetable';
import { MINUTE } from '../utils/time';
interface Boarding { trip: Trip; date: string; index: number }
export function matchesStation(data: Timetable, actual: string, requested: string): boolean {
  return actual === requested || data.stations.find(s => s.id === actual)?.parentId === requested;
}
export function transferSeconds(data: Timetable, from: string, to: string): number | null {
  const a = data.stations.find(s => s.id === from), b = data.stations.find(s => s.id === to);
  const explicit = data.transfers.find(t => t.from === from && t.to === to)
    ?? data.transfers.find(t => (t.from === from || t.from === a?.parentId) && (t.to === to || t.to === b?.parentId));
  if (explicit) return explicit.prohibited ? null : explicit.seconds;
  if (from === to) return 0;
  return a?.parentId && a.parentId === b?.parentId ? 0 : null;
}
function lowerBound(legs: TransitLeg[], departure: number): number {
  let low = 0, high = legs.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (legs[mid].departure < departure) low = mid + 1; else high = mid;
  }
  return low;
}
/** Index only second legs reaching the destination, then query departure windows.
 * Keeps all valid first trains and the fastest allowed arrival for each, without
 * materializing every combination of trips and intermediate stops.
 */
export function findJourneys(data: Timetable, favorite: FavoriteRoute, now: number, realtime: RealtimeUpdate[] = []): Journey[] {
  const updates = freshRealtime(realtime, now), boardings: Boarding[] = [];
  const secondLegs = new Map<string, TransitLeg[]>();
  const stations = new Map(data.stations.map(s => [s.id, s]));
  const trips = new Map(data.trips.map(t => [t.id, t]));
  const matches = (actual: string, requested: string) => actual === requested || stations.get(actual)?.parentId === requested;
  const updatesByTrip = new Map<string, RealtimeUpdate[]>();
  for (const update of updates) {
    const key = `${update.serviceDate}:${update.tripId}`;
    const list = updatesByTrip.get(key) ?? []; list.push(update); updatesByTrip.set(key, list);
  }
  const siblings = new Map<string, string[]>();
  for (const station of data.stations) if (station.parentId) {
    const group = siblings.get(station.parentId) ?? []; group.push(station.id); siblings.set(station.parentId, group);
  }
  const targets = new Map<string, { stop: string; seconds: number }[]>();
  for (const station of data.stations) {
    const connected = new Set([station.id,
      ...(station.parentId ? siblings.get(station.parentId) ?? [] : []),
      ...data.transfers.filter(t => (t.from === station.id || t.from === station.parentId) && !t.prohibited)
        .flatMap(t => [t.to, ...(siblings.get(t.to) ?? [])])]);
    targets.set(station.id, [...connected].flatMap(stop => {
      const minimum = transferSeconds(data, station.id, stop);
      return minimum === null ? [] : [{ stop, seconds: Math.max(minimum, favorite.transferMinutes * 60) }];
    }));
  }
  const serviceCache = new Map<string, boolean>();
  const allowTransfer = favorite.maxTransfers === 1 && favorite.fixedPath.length !== 1;
  for (const date of serviceDates(now)) for (const trip of data.trips) {
    const serviceKey = `${date}:${trip.serviceId}`;
    if (!serviceCache.has(serviceKey)) serviceCache.set(serviceKey, serviceRuns(data, trip.serviceId, date));
    if (!serviceCache.get(serviceKey) || favorite.excludedLines.includes(trip.routeId)) continue;
    const scoped = updatesByTrip.get(`${date}:${trip.id}`) ?? [];
    if (scoped.some(u => u.canceled)) continue;
    trip.stops.forEach((stop, i) => {
      if (stop.pickup && stop.departure !== null && matches(stop.stopId, favorite.from)
        && (!favorite.lineIds.length || favorite.lineIds.includes(trip.routeId))
        && (!favorite.direction || trip.direction === favorite.direction)) boardings.push({ trip, date, index: i });
    });
    if (!allowTransfer) continue;
    for (let end = 1; end < trip.stops.length; end++) {
      if (!matches(trip.stops[end].stopId, favorite.to)) continue;
      for (let start = 0; start < end; start++) {
        const connection = leg(data, trip, date, start, end, scoped);
        if (!connection || connection.departure < now || connection.arrival > now + SEARCH_HORIZON) continue;
        const list = secondLegs.get(connection.from) ?? [];
        list.push(connection); secondLegs.set(connection.from, list);
      }
    }
  }
  for (const list of secondLegs.values()) list.sort((a, b) => a.departure - b.departure || a.arrival - b.arrival);
  const pathsAllow = (legs: TransitLeg[]): boolean => {
    if (favorite.fixedPath.length && (legs.length !== favorite.fixedPath.length || legs.some((l, i) => l.routeId !== favorite.fixedPath[i]))) return false;
    if (!favorite.via.length) return true;
    let progress = 0;
    for (const l of legs) {
      const trip = trips.get(l.tripId)!;
      for (const stop of trip.stops) {
        if (stop.sequence < l.fromSequence || stop.sequence > l.toSequence) continue;
        if (matches(stop.stopId, favorite.via[progress])) progress++;
        if (progress === favorite.via.length) return true;
      }
    }
    return false;
  };
  const preferredCount = (legs: TransitLeg[]) => legs.filter(l => favorite.preferredLines.includes(l.routeId)).length;
  const journeys: Journey[] = [];
  for (const boarding of boardings) {
    let best: TransitLeg[] | undefined;
    const consider = (candidate: TransitLeg[]) => {
      if (!pathsAllow(candidate)) return;
      const arrival = candidate.at(-1)!.arrival, previous = best?.at(-1)!.arrival;
      if (!best || arrival < previous! || arrival === previous && (candidate.length < best.length
        || candidate.length === best.length && preferredCount(candidate) > preferredCount(best))) best = candidate;
    };
    const scoped = updatesByTrip.get(`${boarding.date}:${boarding.trip.id}`) ?? [];
    for (let end = boarding.index + 1; end < boarding.trip.stops.length; end++) {
      const first = leg(data, boarding.trip, boarding.date, boarding.index, end, scoped);
      if (!first) continue;
      if (first.departure < now || first.departure > now + SEARCH_HORIZON) break;
      if (matches(first.to, favorite.to)) consider([first]);
      if (!allowTransfer || favorite.transferAt && !matches(first.to, favorite.transferAt)) continue;
      for (const target of targets.get(first.to) ?? []) {
        const connections = secondLegs.get(target.stop); if (!connections) continue;
        const ready = first.arrival + target.seconds * 1000, latest = first.arrival + 120 * MINUTE;
        for (let i = lowerBound(connections, ready); i < connections.length && connections[i].departure <= latest; i++) {
          const second = connections[i];
          if (second.tripId === boarding.trip.id && second.serviceDate === boarding.date) continue;
          if (best && second.arrival > best.at(-1)!.arrival) continue;
          consider([first, second]);
        }
      }
    }
    if (best) journeys.push({ id: `${boarding.date}:${boarding.trip.id}:${boarding.index}`, legs: best, arrival: best.at(-1)!.arrival, transfers: best.length - 1 });
  }
  return journeys.sort((a, b) => a.legs[0].departure - b.legs[0].departure || a.arrival - b.arrival);
}
