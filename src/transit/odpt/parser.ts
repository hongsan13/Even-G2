import type { Calendar, CalendarException, Timetable, Trip, Station } from '../types';
import { parseServiceTime, serviceMidnight, jstWeekday, jstDate } from '../../utils/time';
export interface OdptMetadata {
  title: string; source: string; license: string; start: string; end: string; holidays: string[];
  licenseUntil?: string;
}
type Row = Record<string, unknown>;
function row(value: unknown): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('ODPT JSONのレコードが不正です');
  return value as Row;
}
function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 300) throw new Error(`ODPTの項目を確認してください: ${field}`);
  return value;
}
function list(value: unknown, field: string, max: number): Row[] {
  if (!Array.isArray(value) || !value.length || value.length > max) throw new Error(`${field}は空または件数上限を超えています`);
  return value.map(row);
}
function title(value: unknown, fallback: unknown): string {
  if (value && typeof value === 'object') { const r = row(value); if (typeof r.ja === 'string' && r.ja) return text(r.ja, '駅・路線名'); }
  return text(fallback, '駅・路線名');
}
const calendarDays: Record<string, boolean[]> = {
  Weekday: [false, true, true, true, true, true, false], SaturdayHoliday: [true, false, false, false, false, false, true],
  SundayHoliday: [true, false, false, false, false, false, false], Holiday: [false, false, false, false, false, false, false],
  Daily: [true, true, true, true, true, true, true], Saturday: [false, false, false, false, false, false, true],
  Sunday: [true, false, false, false, false, false, false],
};
for (const [i, day] of ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].entries()) {
  calendarDays[day] ??= Array.from({ length: 7 }, (_, n) => n === i);
}
export function parseOdpt(railwayInput: unknown, stationInput: unknown, trainInput: unknown, meta: OdptMetadata): Timetable {
  serviceMidnight(meta.start); serviceMidnight(meta.end);
  if (meta.start > meta.end || !meta.title.trim() || !meta.source.trim() || !meta.license.trim()) throw new Error('名称・出典・利用条件・有効期間を確認してください');
  if (meta.licenseUntil) {
    serviceMidnight(meta.licenseUntil);
    if (meta.licenseUntil < jstDate(Date.now()) || meta.end > meta.licenseUntil) throw new Error('許諾期限内の有効期間を指定してください');
  }
  const holidays = [...new Set(meta.holidays)];
  for (const date of holidays) { serviceMidnight(date); if (date < meta.start || date > meta.end) throw new Error('祝日は指定した有効期間内にしてください'); }
  const railways = list(railwayInput, '路線JSON', 1000), rawStations = list(stationInput, '駅JSON', 10000);
  const stations: Station[] = rawStations.map(s => ({ id: text(s['owl:sameAs'], '駅ID'), name: title(s['odpt:stationTitle'], s['dc:title']) }));
  const stationIds = new Set(stations.map(s => s.id));
  if (stationIds.size !== stations.length) throw new Error('駅IDが重複しています');
  const lines = railways.map(r => ({ id: text(r['owl:sameAs'], '路線ID'), name: title(r['odpt:railwayTitle'], r['dc:title']) }));
  const lineIds = new Set(lines.map(l => l.id));
  if (lineIds.size !== lines.length) throw new Error('路線IDが重複しています');
  const calendars: Calendar[] = [], exceptions: CalendarException[] = [];
  const serviceIds = new Set<string>();
  const trips: Trip[] = list(trainInput, '列車時刻表JSON', 20000).map(t => {
    if ((Array.isArray(t['odpt:previousTrainTimetable']) && t['odpt:previousTrainTimetable'].length) ||
        (Array.isArray(t['odpt:nextTrainTimetable']) && t['odpt:nextTrainTimetable'].length) ||
        typeof t['odpt:previousTrainTimetable'] === 'string' || typeof t['odpt:nextTrainTimetable'] === 'string') {
      throw new Error('直通列車の分割時刻表が含まれています。前後レコードの結合は未対応のため、この取込は保存しません');
    }
    const routeId = text(t['odpt:railway'], '列車の路線');
    if (!lineIds.has(routeId)) throw new Error('列車に対応する路線JSONがありません');
    const serviceId = text(t['odpt:calendar'], '運行日');
    const kind = serviceId.replace(/^odpt\.Calendar:/, '');
    const days = calendarDays[kind];
    if (!days || !serviceId.startsWith('odpt.Calendar:')) throw new Error('未対応の運行日です。平日・土休日などの運行日を確認してください');
    if (!serviceIds.has(serviceId)) {
      serviceIds.add(serviceId); calendars.push({ id: serviceId, start: meta.start, end: meta.end, days });
      for (const date of holidays) {
        const added = ['Daily', 'Holiday', 'SaturdayHoliday', 'SundayHoliday'].includes(kind);
        if (added !== days[jstWeekday(date)]) exceptions.push({ serviceId, date, added });
      }
    }
    const railway = railways.find(r => r['owl:sameAs'] === routeId)!;
    const direction = t['odpt:railDirection'] && t['odpt:railDirection'] === railway['odpt:ascendingRailDirection'] ? '0' :
      t['odpt:railDirection'] && t['odpt:railDirection'] === railway['odpt:descendingRailDirection'] ? '1' : '';
    let previous = -1;
    const stops = list(t['odpt:trainTimetableObject'], '停車時刻', 2000).map((s, i) => {
      const a = s['odpt:arrivalStation'], d = s['odpt:departureStation'];
      if (a && d && a !== d) throw new Error('同じ停車レコードの到着駅と発車駅が異なります');
      const stopId = text(d ?? a, '停車駅');
      if (!stationIds.has(stopId)) throw new Error('停車駅に対応する駅JSONがありません');
      const time = (v: unknown): number | null => {
        if (v === undefined || v === null || v === '') return null;
        const input = text(v, '時刻');
        const seconds = parseServiceTime(/^\d{1,2}:[0-5]\d$/.test(input) ? `${input}:00` : input);
        if (seconds < previous) throw new Error('時刻の順序が不正です。日付跨ぎは24時以降で指定してください');
        previous = seconds; return seconds;
      };
      const arrival = time(s['odpt:arrivalTime']), departure = time(s['odpt:departureTime']);
      if (arrival === null && departure === null) throw new Error('停車時刻がありません');
      if (arrival !== null && !a || departure !== null && !d) throw new Error('発着時刻に対応する駅IDがありません');
      return { stopId, sequence: i + 1, arrival, departure, pickup: departure !== null, dropoff: arrival !== null || departure !== null };
    });
    if (stops.length < 2 || !stops.slice(0, -1).some(s => s.departure !== null)) throw new Error('検索可能な停車時刻が不足しています');
    return { id: text(t['owl:sameAs'], '便ID'), routeId, serviceId, direction, headsign: stations.find(s => s.id === stops.at(-1)!.stopId)!.name, stops, readOnly: true };
  });
  if (new Set(trips.map(t => t.id)).size !== trips.length) throw new Error('便IDが重複しています');
  const used = new Set(trips.flatMap(t => t.stops.map(s => s.stopId)));
  return { schema: 1, id: crypto.randomUUID(), title: meta.title, source: meta.source, license: meta.license,
    timezone: 'Asia/Tokyo', importedAt: Date.now(), validUntil: meta.end, licenseUntil: meta.licenseUntil,
    demo: false, stations: stations.filter(s => used.has(s.id)), lines, trips, calendars, exceptions, transfers: [] };
}
