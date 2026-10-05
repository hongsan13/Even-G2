import type { Timetable, Trip, RealtimeUpdate, TransitLeg } from './types';
import { DAY, jstDate, addDays, jstWeekday, serviceMidnight } from '../utils/time';
export function serviceRuns(data: Timetable, serviceId: string, date: string): boolean {
  const override = data.exceptions.find(e => e.serviceId === serviceId && e.date === date);
  if (override) return override.added;
  const calendar = data.calendars.find(c => c.id === serviceId);
  return !!calendar && calendar.start <= date && date <= calendar.end && calendar.days[jstWeekday(date)];
}
export function serviceDates(now: number): string[] {
  const today = jstDate(now);
  return [-2, -1, 0, 1].map(offset => addDays(today, offset));
}
export function freshRealtime(updates: RealtimeUpdate[], now: number): RealtimeUpdate[] {
  return updates.filter(u => now - u.updatedAt <= 120_000 && u.updatedAt <= now + 30_000);
}
export function tripCanceled(updates: RealtimeUpdate[], tripId: string, date: string): boolean {
  return updates.some(u => u.tripId === tripId && u.serviceDate === date && u.canceled);
}
export function leg(data: Timetable, trip: Trip, date: string, fromIndex: number, toIndex: number, updates: RealtimeUpdate[]): TransitLeg | null {
  if (toIndex <= fromIndex || tripCanceled(updates, trip.id, date)) return null;
  const from = trip.stops[fromIndex], to = trip.stops[toIndex];
  if (!from.pickup || !to.dropoff || from.departure === null) return null;
  const applicable = updates.filter(u => u.tripId === trip.id && u.serviceDate === date);
  const at = (index: number) => applicable.find(u => u.stopSequence === trip.stops[index].sequence)
    ?? applicable.find(u => u.stopId === trip.stops[index].stopId);
  if (at(fromIndex)?.skipped || at(toIndex)?.skipped) return null;
  const base = serviceMidnight(date);
  const departureDelay = (index: number): number => {
    for (let i = index; i >= 0; i--) {
      const update = at(i);
      if (update?.departureTime !== undefined && trip.stops[i].departure !== null) return (update.departureTime - (base + trip.stops[i].departure! * 1000)) / 1000;
      if (update?.delaySeconds !== undefined) return update.delaySeconds;
      if (update?.arrivalTime !== undefined && trip.stops[i].arrival !== null) return (update.arrivalTime - (base + trip.stops[i].arrival! * 1000)) / 1000;
      if (update?.arrivalDelaySeconds !== undefined) return update.arrivalDelaySeconds;
    }
    return applicable.find(u => u.stopId === undefined && u.stopSequence === undefined)?.delaySeconds ?? 0;
  };
  const start = at(fromIndex), end = at(toIndex);
  const scheduledDeparture = base + from.departure * 1000;
  const departure = start?.departureTime ?? scheduledDeparture + departureDelay(fromIndex) * 1000;
  // A stop's departure is a conservative upper bound for its missing arrival.
  // Unknown arrival AND departure cannot support an alighting/transfer leg.
  const scheduledArrival = to.arrival ?? to.departure;
  if (end?.arrivalTime === undefined && scheduledArrival === null) return null;
  const arrival = end?.arrivalTime ?? base + scheduledArrival! * 1000 + (end?.arrivalDelaySeconds ?? departureDelay(toIndex)) * 1000;
  if (arrival < departure) return null;
  return { tripId: trip.id, serviceDate: date, routeId: trip.routeId, direction: trip.direction,
    from: from.stopId, to: to.stopId, scheduledDeparture, departure, arrival,
    fromSequence: from.sequence, toSequence: to.sequence,
    arrivalEstimated: to.arrival === null && end?.arrivalTime === undefined,
    headsign: trip.headsign, kind: trip.kind, platform: data.stations.find(s => s.id === from.stopId)?.platform,
    delaySeconds: (departure - scheduledDeparture) / 1000 };
}
export function dataExpired(data: Timetable, now: number): boolean {
  return !!data.validUntil && jstDate(now) > data.validUntil;
}
export const SEARCH_HORIZON = 2 * DAY;
