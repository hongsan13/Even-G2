export interface Station { id: string; name: string; parentId?: string; platform?: string; latitude?: number; longitude?: number }
export interface Line { id: string; name: string; agencyId?: string }
export type Direction = '0' | '1' | '';
export interface StopTime { stopId: string; sequence: number; arrival: number | null; departure: number | null; pickup: boolean; dropoff: boolean }
export interface Trip { id: string; routeId: string; serviceId: string; direction: Direction; headsign: string; kind?: string; stops: StopTime[] }
export interface Route { id: string; lineIds: string[]; stopIds: string[] }
export interface Transfer { from: string; to: string; seconds: number; prohibited: boolean }
export interface Calendar { id: string; start: string; end: string; days: boolean[] }
export interface CalendarException { serviceId: string; date: string; added: boolean }
export interface Timetable {
  schema: 1; id: string; title: string; source: string; license: string; timezone: 'Asia/Tokyo';
  importedAt: number; version?: string; validUntil?: string; demo: boolean;
  stations: Station[]; lines: Line[]; trips: Trip[]; calendars: Calendar[];
  exceptions: CalendarException[]; transfers: Transfer[];
}
export type Reachability = 'SAFE' | 'LEAVE_NOW' | 'TIGHT' | 'MISSED';
export interface RealtimeUpdate {
  tripId: string; serviceDate: string; stopId?: string; stopSequence?: number;
  delaySeconds?: number; arrivalDelaySeconds?: number; departureTime?: number; arrivalTime?: number;
  canceled?: boolean; skipped?: boolean; updatedAt: number;
}
export interface TransitLeg {
  tripId: string; serviceDate: string; routeId: string; direction: Direction;
  from: string; to: string; scheduledDeparture: number; departure: number; arrival: number;
  fromSequence: number; toSequence: number;
  arrivalEstimated?: boolean;
  headsign: string; kind?: string; platform?: string; delaySeconds: number;
}
export interface Journey { id: string; legs: TransitLeg[]; arrival: number; transfers: number }
export interface Departure {
  journey: Journey; departureTime: number; minutesUntilDeparture: number;
  leaveAt: number; reachable: boolean; status: Reachability; canceled: boolean;
}
export interface AutoSwitch { days: number[]; start: string; end: string }
export interface FavoriteRoute {
  id: string; name: string; from: string; to: string;
  lineIds: string[]; direction: Direction; via: string[];
  walkingMinutes: number; bufferMinutes: number; transferMinutes: number;
  days: number[]; preferredLines: string[]; excludedLines: string[];
  fixedPath: string[]; transferAt?: string; secondTransferAt?: string; maxTransfers: 0 | 1 | 2; auto?: AutoSwitch;
}
export interface Settings {
  schema: 1; favorites: FavoriteRoute[]; activeId: string;
  refreshSeconds: number; useRealtime: boolean;
}
