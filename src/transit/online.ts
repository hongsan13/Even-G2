import type { FavoriteRoute, Journey, Timetable } from './types';
import { boundedResponse } from './gtfs/loader';
async function request(base: string, path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(`${base}${path}`, { ...init, credentials: 'omit', redirect: 'error', cache: 'no-store', signal: signal ?? AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error('オンライン案内に接続できません。しばらくして再試行してください');
  return JSON.parse(new TextDecoder().decode(await boundedResponse(response, 4 * 1024 * 1024)));
}
export async function onlineCatalog(base: string): Promise<Timetable> {
  const d = await request(base, '/v1/catalog', {}, AbortSignal.timeout(90000)) as Timetable;
  if (d.schema !== 1 || d.timezone !== 'Asia/Tokyo' || d.serverManaged !== true || !Array.isArray(d.stations) || d.stations.length > 10000 || !Array.isArray(d.lines) || d.lines.length > 1000 || typeof d.id !== 'string' ||
    !d.stations.every(s => typeof s.id === 'string' && typeof s.name === 'string') || !d.lines.every(l => typeof l.id === 'string' && typeof l.name === 'string') ||
    !Number.isFinite(d.importedAt) || typeof d.source !== 'string' || typeof d.license !== 'string' || typeof d.title !== 'string' || d.validUntil !== undefined && !/^\d{8}$/.test(d.validUntil)) throw new Error('オンライン駅一覧の形式を確認できません');
  // Do not accept full timetable or unexpected server fields as a cache payload.
  return { schema: 1, id: d.id, title: d.title, source: d.source, license: d.license, timezone: 'Asia/Tokyo', importedAt: d.importedAt,
    validUntil: d.validUntil, demo: false, serverManaged: true, stations: d.stations.map(s => ({ id: s.id, name: s.name, lineIds: Array.isArray(s.lineIds) ? s.lineIds.filter(id => typeof id === 'string' && d.lines.some(l => l.id === id)) : [] })), lines: d.lines.map(l => ({ id: l.id, name: l.name })), trips: [], calendars: [], exceptions: [], transfers: [] };
}
export async function onlineJourneys(base: string, data: Timetable, favorite: FavoriteRoute, signal: AbortSignal): Promise<Journey[]> {
  const query = { ...favorite, id: 'query', name: 'オンライン経路', auto: undefined };
  const result = await request(base, '/v1/journeys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(query) }, signal) as { journeys: Journey[]; expiresAt: number };
  const now = Date.now(), stations = new Set(data.stations.map(s => s.id)), lines = new Set(data.lines.map(l => l.id));
  if (!Number.isFinite(result.expiresAt) || result.expiresAt <= now || result.expiresAt > now + 61000 || !Array.isArray(result.journeys) || result.journeys.length > 7) throw new Error('オンライン案内の期限・形式を確認できません');
  for (const j of result.journeys) {
    if (typeof j.id !== 'string' || !Array.isArray(j.legs) || j.legs.length < 1 || j.legs.length > 3 || j.transfers !== j.legs.length - 1 || !Number.isFinite(j.arrival)) throw new Error('オンライン経路の形式を確認できません');
    for (const l of j.legs) if (!stations.has(l.from) || !stations.has(l.to) || !lines.has(l.routeId) || typeof l.tripId !== 'string' || typeof l.headsign !== 'string' || !/^\d{8}$/.test(l.serviceDate) ||
      ![l.departure, l.arrival, l.scheduledDeparture, l.delaySeconds, l.fromSequence, l.toSequence].every(Number.isFinite) || l.arrival < l.departure || l.departure < now - 61 * 60000 || l.arrival > now + 49 * 3600000) throw new Error('オンライン経路の駅・時刻を確認できません');
  }
  return result.journeys;
}
