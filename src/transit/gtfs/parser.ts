import { unzipSync, strFromU8 } from 'fflate';
import type { Timetable, StopTime, Trip } from '../types';
import { parseServiceTime, serviceMidnight } from '../../utils/time';
export const MAX_ZIP_BYTES = 12 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 60 * 1024 * 1024;
type Row = Record<string, string>;
export function parseCsv(text: string): Row[] {
  text = text.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [], cell = '', quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === '"') {
      if (cell || closed) throw new Error('CSVの引用符が不正です');
      quoted = true;
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(cell); cell = ''; closed = false;
      if (c !== ',') {
        if (row.some(s => s !== '')) records.push(row);
        row = [];
        if (c === '\r' && text[i + 1] === '\n') i++;
      }
    } else {
      if (closed) throw new Error('CSVの引用符の後に不正な文字があります');
      cell += c;
    }
    if (cell.length > 8192 || records.length > 500_000) throw new Error('GTFSが大きすぎます');
  }
  if (quoted) throw new Error('CSVの引用符が閉じられていません');
  row.push(cell); if (row.some(s => s !== '')) records.push(row);
  const headers = records.shift() ?? [];
  if (!headers.length || new Set(headers).size !== headers.length) throw new Error('CSVの列名が空または重複しています');
  return records.map(values => {
    if (values.length !== headers.length) throw new Error('CSVの列数が一致しません');
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}
function required(row: Row, name: string): string {
  const value = row[name];
  if (!value?.trim()) throw new Error(`GTFSの必須項目がありません: ${name}`);
  if (value.length > 200) throw new Error(`項目が長すぎます: ${name}`);
  return value;
}
function date(value: string): string { serviceMidnight(value); return value; }
function integer(value: string | undefined, fallback = 0): number {
  if (value === undefined || value === '') return fallback;
  if (!/^\d+$/.test(value)) throw new Error(`不正な整数: ${value}`);
  return +value;
}
function unique(rows: Row[], key: string): void {
  const values = rows.map(r => required(r, key));
  if (new Set(values).size !== values.length) throw new Error(`IDが重複しています: ${key}`);
}
export interface ImportMetadata { title: string; source: string; license: string; importedAt?: number }
export function parseGtfsZip(bytes: Uint8Array, meta: ImportMetadata): Timetable {
  if (bytes.byteLength > MAX_ZIP_BYTES) throw new Error('ZIPは12MB以下に絞ってください');
  const wanted = new Set(['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'calendar.txt', 'calendar_dates.txt', 'transfers.txt', 'feed_info.txt', 'frequencies.txt']);
  let expanded = 0;
  const files = unzipSync(bytes, { filter: file => {
    expanded += file.originalSize;
    if (expanded > MAX_EXPANDED_BYTES) throw new Error('展開後のGTFSは60MB以下にしてください');
    return wanted.has(file.name.split('/').at(-1)!);
  } });
  const tables = new Map<string, Row[]>();
  for (const [name, content] of Object.entries(files)) {
    const base = name.split('/').at(-1)!;
    if (tables.has(base)) throw new Error(`GTFSファイルが重複しています: ${base}`);
    tables.set(base, parseCsv(strFromU8(content)));
  }
  for (const name of ['agency.txt', 'stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt']) {
    if (!tables.get(name)?.length) throw new Error(`GTFSファイルがありません: ${name}`);
  }
  if (!tables.get('calendar.txt')?.length && !tables.get('calendar_dates.txt')?.length) throw new Error('運行日カレンダーがありません');
  const table = (name: string): Row[] => tables.get(`${name}.txt`) ?? [];
  for (const agency of table('agency')) if (required(agency, 'agency_timezone') !== 'Asia/Tokyo') throw new Error('現在はAsia/TokyoのGTFSのみ対応しています');
  for (const [name, key] of [['stops', 'stop_id'], ['routes', 'route_id'], ['trips', 'trip_id'], ['calendar', 'service_id']]) unique(table(name), key);
  if (table('frequencies').length) throw new Error('frequencies.txtは未対応です。正確なstop_timesを持つGTFSを使用してください');
  const stations = table('stops').map(r => ({ id: required(r, 'stop_id'), name: required(r, 'stop_name'),
    parentId: r.parent_station || undefined, platform: r.platform_code || undefined,
    latitude: r.stop_lat ? +r.stop_lat : undefined, longitude: r.stop_lon ? +r.stop_lon : undefined }));
  for (const s of stations) {
    if (s.parentId && !stations.some(p => p.id === s.parentId)) throw new Error('parent_stationの参照先がありません');
    if (s.latitude !== undefined && (!Number.isFinite(s.latitude) || Math.abs(s.latitude) > 90)
      || s.longitude !== undefined && (!Number.isFinite(s.longitude) || Math.abs(s.longitude) > 180)) throw new Error('駅の座標が不正です');
  }
  const lines = table('routes').map(r => ({ id: required(r, 'route_id'), name: r.route_long_name || r.route_short_name || required(r, 'route_id'), agencyId: r.agency_id || undefined }));
  const calendars = table('calendar').map(r => {
    const start = date(required(r, 'start_date')), end = date(required(r, 'end_date'));
    if (end < start) throw new Error('カレンダーの有効期間が逆転しています');
    return { id: required(r, 'service_id'), start, end,
      days: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map(d => {
        if (!['0', '1'].includes(r[d])) throw new Error('曜日フラグが不正です');
        return r[d] === '1';
      }) };
  });
  const exceptions = table('calendar_dates').map(r => {
    if (!['1', '2'].includes(r.exception_type)) throw new Error('運行日例外が不正です');
    return { serviceId: required(r, 'service_id'), date: date(required(r, 'date')), added: r.exception_type === '1' };
  });
  if (new Set(exceptions.map(e => `${e.serviceId}:${e.date}`)).size !== exceptions.length) throw new Error('運行日例外が重複しています');
  const stopIds = new Set(stations.map(s => s.id)), routeIds = new Set(lines.map(l => l.id));
  const serviceIds = new Set([...calendars.map(c => c.id), ...exceptions.map(e => e.serviceId)]);
  const stopTimes = new Map<string, StopTime[]>();
  for (const r of table('stop_times')) {
    const tripId = required(r, 'trip_id'), stopId = required(r, 'stop_id');
    if (!stopIds.has(stopId)) throw new Error('stop_timesの駅が見つかりません');
    if (r.start_pickup_drop_off_window || r.end_pickup_drop_off_window || r.location_id || r.location_group_id) throw new Error('予約・時間帯指定のstop_timesは未対応です');
    const times = stopTimes.get(tripId) ?? [];
    times.push({ stopId, sequence: integer(required(r, 'stop_sequence')),
      // Preserve absent times. Do not turn missing arrivals into published times,
      // or invent departure times at untimed intermediate stops.
      arrival: r.arrival_time?.trim() ? parseServiceTime(r.arrival_time.trim()) : null,
      departure: r.departure_time?.trim() ? parseServiceTime(r.departure_time.trim()) : null,
      pickup: !r.pickup_type || r.pickup_type === '0', dropoff: !r.drop_off_type || r.drop_off_type === '0' });
    stopTimes.set(tripId, times);
  }
  const trips: Trip[] = table('trips').map(r => {
    const id = required(r, 'trip_id'), routeId = required(r, 'route_id'), serviceId = required(r, 'service_id');
    if (!routeIds.has(routeId) || !serviceIds.has(serviceId)) throw new Error('tripsの路線または運行日がありません');
    if (!['', '0', '1', undefined].includes(r.direction_id)) throw new Error('方向は0または1を指定してください');
    const stops = (stopTimes.get(id) ?? []).sort((a, b) => a.sequence - b.sequence);
    if (stops.length < 2 || new Set(stops.map(s => s.sequence)).size !== stops.length) throw new Error('停車順序が不正です');
    if (!stops.some(s => s.departure !== null)) throw new Error(`列車 ${id} に発車時刻がありません`);
    let previousTime = -1;
    stops.forEach(s => {
      for (const time of [s.arrival, s.departure]) {
        if (time === null) continue;
        if (time < previousTime) throw new Error('stop_timesの時刻が逆転しています');
        previousTime = time;
      }
    });
    return { id, routeId, serviceId, direction: r.direction_id === '1' ? '1' : r.direction_id === '0' ? '0' : '', headsign: r.trip_headsign || stations.find(s => s.id === stops.at(-1)!.stopId)!.name, kind: r.trip_short_name || undefined, stops };
  });
  if (trips.length > 20_000) throw new Error('20,000便以下の地域別GTFSを使用してください');
  const tripIds = new Set(trips.map(t => t.id));
  if ([...stopTimes.keys()].some(id => !tripIds.has(id))) throw new Error('stop_timesの列車が見つかりません');
  const transfers = table('transfers').map(r => {
    if (r.from_route_id || r.to_route_id || r.from_trip_id || r.to_trip_id) throw new Error('列車・路線限定のtransfersは未対応です');
    const from = required(r, 'from_stop_id'), to = required(r, 'to_stop_id'), type = integer(r.transfer_type);
    if (!stopIds.has(from) || !stopIds.has(to) || type > 3) throw new Error('transfersの駅または種類が不正です');
    if (type === 1) throw new Error('接続保証のtransfersは未対応です');
    return { from, to, seconds: integer(r.min_transfer_time), prohibited: type === 3 };
  });
  const feed = table('feed_info')[0];
  const validUntil = feed?.feed_end_date ? date(feed.feed_end_date)
    : [...calendars.map(c => c.end), ...exceptions.filter(e => e.added).map(e => e.date)].sort().at(-1);
  return { schema: 1, id: crypto.randomUUID(), title: meta.title || feed?.feed_publisher_name || 'GTFS',
    source: meta.source, license: meta.license, timezone: 'Asia/Tokyo', importedAt: meta.importedAt ?? Date.now(),
    version: feed?.feed_version || undefined, validUntil, demo: false, stations, lines, trips, calendars, exceptions, transfers };
}
