import type { FavoriteRoute, Journey, Timetable, RealtimeUpdate, TransitLeg, Trip } from './types';
import { leg, freshRealtime, serviceDates, serviceRuns, SEARCH_HORIZON } from './timetable';
import { MINUTE } from '../utils/time';
interface Boarding { trip: Trip; date: string; index: number; departure?: number }
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
/** Index destination-reaching legs, then query one- or two-transfer windows.
 * Keeps all valid first trains and the fastest allowed arrival for each, without
 * materializing every combination of trips and intermediate stops.
 */
export function findJourneys(data: Timetable, favorite: FavoriteRoute, now: number, realtime: RealtimeUpdate[] = []): Journey[] {
  const updates = freshRealtime(realtime, now), boardings: Boarding[] = [];
  const secondLegs = new Map<string, TransitLeg[]>();
  const intermediateBoardings = new Map<string, Boarding[]>();
  const activeTrips: { trip: Trip; date: string; scoped: RealtimeUpdate[] }[] = [];
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
  const allowTransfer = favorite.maxTransfers >= 1 && favorite.fixedPath.length !== 1;
  for (const date of serviceDates(now)) for (const trip of data.trips) {
    const serviceKey = `${date}:${trip.serviceId}`;
    if (!serviceCache.has(serviceKey)) serviceCache.set(serviceKey, serviceRuns(data, trip.serviceId, date));
    if (!serviceCache.get(serviceKey) || favorite.excludedLines.includes(trip.routeId)) continue;
    const scoped = updatesByTrip.get(`${date}:${trip.id}`) ?? [];
    if (scoped.some(u => u.canceled)) continue;
    if (favorite.maxTransfers === 2) activeTrips.push({ trip, date, scoped });
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
  const advanceVia = (l: TransitLeg, progress: number): number => {
    if (progress === favorite.via.length) return progress;
    for (const stop of trips.get(l.tripId)!.stops) {
      if (stop.sequence < l.fromSequence || stop.sequence > l.toSequence) continue;
      if (matches(stop.stopId, favorite.via[progress])) progress++;
      if (progress === favorite.via.length) break;
    }
    return progress;
  };
  const pathsAllow = (legs: TransitLeg[]): boolean => {
    if (favorite.secondTransferAt && legs.length !== 3) return false;
    if (favorite.fixedPath.length && (legs.length !== favorite.fixedPath.length || legs.some((l, i) => l.routeId !== favorite.fixedPath[i]))) return false;
    return legs.reduce((progress, l) => advanceVia(l, progress), 0) === favorite.via.length;
  };
  const preferredCount = (legs: TransitLeg[]) => legs.filter(l => favorite.preferredLines.includes(l.routeId)).length;
  const sameTrip = (a: TransitLeg, b: { tripId: string; serviceDate: string }) => a.tripId === b.tripId && a.serviceDate === b.serviceDate;
  const better = (candidate: TransitLeg[], best?: TransitLeg[]) => !best || candidate.at(-1)!.arrival < best.at(-1)!.arrival
    || candidate.at(-1)!.arrival === best.at(-1)!.arrival && (candidate.length < best.length
      || candidate.length === best.length && preferredCount(candidate) > preferredCount(best));
  if (favorite.maxTransfers === 2 && (!favorite.fixedPath.length || favorite.fixedPath.length === 3)) {
    for (const { trip, date, scoped } of activeTrips) {
      if (favorite.fixedPath.length && trip.routeId !== favorite.fixedPath[1]) continue;
      // Only middle trips with an alighting stop connected to a final leg matter.
      const ends = trip.stops.map((s, i) => (targets.get(s.stopId) ?? []).some(t => secondLegs.has(t.stop)) ? i : -1).filter(i => i >= 0);
      const lastEnd = Math.max(-1, ...ends);
      for (let start = 0; start < lastEnd; start++) {
        const stop = trip.stops[start]; if (!stop.pickup || stop.departure === null) continue;
        let boardingLeg: TransitLeg | null = null;
        for (const end of ends) {
          if (end <= start) continue;
          boardingLeg = leg(data, trip, date, start, end, scoped);
          if (boardingLeg) break;
        }
        if (!boardingLeg || boardingLeg.departure < now || boardingLeg.departure > now + SEARCH_HORIZON) continue;
        const list = intermediateBoardings.get(stop.stopId) ?? [];
        list.push({ trip, date, index: start, departure: boardingLeg.departure }); intermediateBoardings.set(stop.stopId, list);
      }
    }
    for (const list of intermediateBoardings.values()) list.sort((a, b) => a.departure! - b.departure!);
  }
  const middleCache = new Map<string, TransitLeg[] | undefined>();
  /** The best two-leg suffix is independent of the first train's arrival once
   * that middle boarding is reachable. Cache it by boarding and via progress.
   * Recompute with a blocked first trip only if the cached suffix reuses it. */
  const middleTail = (boarding: Boarding, progress: number, blocked?: TransitLeg): TransitLeg[] | undefined => {
    const key = `${boarding.date}:${boarding.trip.id}:${boarding.index}:${progress}:${blocked ? `${blocked.serviceDate}:${blocked.tripId}` : ''}`;
    if (middleCache.has(key)) return middleCache.get(key);
    let best: TransitLeg[] | undefined;
    const scoped = updatesByTrip.get(`${boarding.date}:${boarding.trip.id}`) ?? [];
    for (let end = boarding.index + 1; end < boarding.trip.stops.length; end++) {
      const middle = leg(data, boarding.trip, boarding.date, boarding.index, end, scoped);
      if (!middle || favorite.secondTransferAt && !matches(middle.to, favorite.secondTransferAt) || best && middle.arrival > best.at(-1)!.arrival) continue;
      const nextProgress = advanceVia(middle, progress);
      for (const target of targets.get(middle.to) ?? []) {
        const finals = secondLegs.get(target.stop); if (!finals) continue;
        const ready = middle.arrival + target.seconds * 1000, latest = middle.arrival + 120 * MINUTE;
        for (let i = lowerBound(finals, ready); i < finals.length && finals[i].departure <= latest; i++) {
          const final = finals[i];
          if (sameTrip(middle, final) || blocked && sameTrip(blocked, final) || best && final.arrival > best.at(-1)!.arrival) continue;
          if (favorite.fixedPath.length && final.routeId !== favorite.fixedPath[2]) continue;
          if (advanceVia(final, nextProgress) !== favorite.via.length) continue;
          const candidate = [middle, final]; if (better(candidate, best)) best = candidate;
        }
      }
    }
    middleCache.set(key, best); return best;
  };
  const boardingLowerBound = (list: Boarding[], departure: number): number => {
    let low = 0, high = list.length;
    while (low < high) { const mid = (low + high) >>> 1; if (list[mid].departure! < departure) low = mid + 1; else high = mid; }
    return low;
  };
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
        const connections = secondLegs.get(target.stop) ?? [];
        const ready = first.arrival + target.seconds * 1000, latest = first.arrival + 120 * MINUTE;
        for (let i = lowerBound(connections, ready); i < connections.length && connections[i].departure <= latest; i++) {
          const second = connections[i];
          if (second.tripId === boarding.trip.id && second.serviceDate === boarding.date) continue;
          if (best && second.arrival > best.at(-1)!.arrival) continue;
          consider([first, second]);
        }
        if (favorite.maxTransfers !== 2 || favorite.fixedPath.length && favorite.fixedPath.length !== 3) continue;
        if (favorite.fixedPath.length && first.routeId !== favorite.fixedPath[0]) continue;
        const middleBoardings = intermediateBoardings.get(target.stop); if (!middleBoardings) continue;
        const progress = advanceVia(first, 0);
        for (let i = boardingLowerBound(middleBoardings, ready); i < middleBoardings.length && middleBoardings[i].departure! <= latest; i++) {
          const middle = middleBoardings[i];
          if (first.tripId === middle.trip.id && first.serviceDate === middle.date) continue;
          if (best && middle.departure! > best.at(-1)!.arrival) break;
          let tail = middleTail(middle, progress);
          if (tail?.some(l => sameTrip(first, l))) tail = middleTail(middle, progress, first);
          if (tail && (!best || tail.at(-1)!.arrival <= best.at(-1)!.arrival)) consider([first, ...tail]);
        }
      }
    }
    if (best) journeys.push({ id: `${boarding.date}:${boarding.trip.id}:${boarding.index}`, legs: best, arrival: best.at(-1)!.arrival, transfers: best.length - 1 });
  }
  return journeys.sort((a, b) => a.legs[0].departure - b.legs[0].departure || a.arrival - b.arrival);
}
