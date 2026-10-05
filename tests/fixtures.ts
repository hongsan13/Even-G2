import { zipSync, strToU8 } from 'fflate';
import type { Timetable, Trip, FavoriteRoute } from '../src/transit/types';
import { parseServiceTime, serviceMidnight } from '../src/utils/time';
export const time = (clock: string, date = '20261005') => serviceMidnight(date) + parseServiceTime(`${clock}:00`) * 1000;
export function trip(id: string, stops: [string, string][], routeId = 'L1', serviceId = 'daily'): Trip {
  return { id, routeId, serviceId, direction: '0', headsign: stops.at(-1)![0],
    stops: stops.map(([stopId, clock], i) => ({ stopId, sequence: i + 1, arrival: parseServiceTime(`${clock}:00`), departure: parseServiceTime(`${clock}:00`), pickup: true, dropoff: true })) };
}
export function data(trips: Trip[] = [trip('t1', [['A', '13:52'], ['B', '14:13']]), trip('t2', [['A', '13:58'], ['B', '14:19']]), trip('t3', [['A', '14:04'], ['B', '14:25']])]): Timetable {
  return { schema: 1, id: 'test', title: 'test', source: 'test', license: 'CC0', timezone: 'Asia/Tokyo', importedAt: time('12:00'), demo: false,
    stations: ['A', 'B', 'C', 'D'].map(id => ({ id, name: id })), lines: ['L1', 'L2'].map(id => ({ id, name: id })), trips,
    calendars: [{ id: 'daily', start: '20260101', end: '20261231', days: [true, true, true, true, true, true, true] }], exceptions: [], transfers: [] };
}
export function favorite(patch: Partial<FavoriteRoute> = {}): FavoriteRoute {
  return { id: 'fav', name: 'A → B', from: 'A', to: 'B', direction: '', lineIds: [], via: [], walkingMinutes: 7, bufferMinutes: 2, transferMinutes: 4,
    days: [0, 1, 2, 3, 4, 5, 6], preferredLines: [], excludedLines: [], fixedPath: [], maxTransfers: 0, ...patch };
}
export const gtfsFiles: Record<string, string> = {
  'agency.txt': 'agency_id,agency_name,agency_url,agency_timezone\na,テスト,https://example.org,Asia/Tokyo\n',
  'stops.txt': 'stop_id,stop_name,stop_lat,stop_lon\nA,駅A,35,139\nB,"駅B,出口",35.1,139.1\n',
  'routes.txt': 'route_id,route_short_name,route_long_name,route_type\nL1,試験,試験線,3\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign,direction_id\nL1,daily,t1,駅B,0\n',
  'stop_times.txt': 'trip_id,arrival_time,departure_time,stop_id,stop_sequence\nt1,23:59:00,23:59:00,A,1\nt1,24:05:00,24:05:00,B,2\n',
  'calendar.txt': 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\ndaily,1,1,1,1,1,1,1,20260101,20261231\n',
  'feed_info.txt': 'feed_publisher_name,feed_publisher_url,feed_lang,feed_version,feed_end_date\n試験,https://example.org,ja,v1,20261231\n',
};
export function zip(files = gtfsFiles): Uint8Array { return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strToU8(v)]))); }
