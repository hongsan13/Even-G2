import type { Departure, Journey, Reachability } from './types';
import { MINUTE } from '../utils/time';
export function selectNextDepartures(journeys: Journey[], currentTime: number, walkingMinutes: number, bufferMinutes: number): Departure[] {
  if (![walkingMinutes, bufferMinutes].every(n => Number.isFinite(n) && n >= 0)) throw new Error('徒歩・余裕時間は0以上にしてください');
  return journeys.filter(j => j.legs[0].departure >= currentTime).map(journey => {
    const departureTime = journey.legs[0].departure;
    const leaveAt = departureTime - (walkingMinutes + bufferMinutes) * MINUTE;
    const margin = leaveAt - currentTime;
    const status: Reachability = margin < 0 ? 'MISSED' : margin <= MINUTE ? 'TIGHT' : margin <= 3 * MINUTE ? 'LEAVE_NOW' : 'SAFE';
    return { journey, departureTime, minutesUntilDeparture: Math.ceil((departureTime - currentTime) / MINUTE),
      leaveAt, reachable: margin >= 0, status, canceled: false };
  }).sort((a, b) => a.departureTime - b.departureTime || a.journey.arrival - b.journey.arrival || a.journey.id.localeCompare(b.journey.id));
}

/** Recommend the earliest reachable arrival, including a faster later train. */
export function recommendedDeparture(departures: Departure[]): Departure | undefined {
  return departures.filter(d => d.reachable).sort((a, b) => a.journey.arrival - b.journey.arrival || a.journey.transfers - b.journey.transfers || a.departureTime - b.departureTime)[0] ?? departures[0];
}

/** Historical choices are explicit boarding recovery, never future recommendations. */
export const BOARDING_LOOKBACK_MINUTES = 60;
export function pastDepartures(journeys: Journey[], now: number): Departure[] {
  return journeys.filter(j => j.legs[0].departure < now && j.legs[0].departure >= now - BOARDING_LOOKBACK_MINUTES * MINUTE && j.arrival > now)
    .map(journey => ({ journey, departureTime: journey.legs[0].departure, minutesUntilDeparture: Math.ceil((journey.legs[0].departure - now) / MINUTE),
      leaveAt: journey.legs[0].departure, reachable: false, status: 'MISSED' as const, canceled: false }))
    .sort((a, b) => a.departureTime - b.departureTime || a.journey.arrival - b.journey.arrival);
}
