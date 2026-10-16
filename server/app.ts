import { createServer, type IncomingMessage } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import type { FavoriteRoute, Journey, Timetable } from '../src/transit/types';
import { validateFavorite } from '../src/state/store';
import { jstDate } from '../src/utils/time';
import type { Catalog } from './catalog';
export type ServiceCatalog = Pick<Catalog, 'refresh' | 'data' | 'statuses'>;
function search(data: Timetable, favorite: FavoriteRoute, now: number): Promise<Journey[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./search-worker.js', import.meta.url), { workerData: { data, favorite, now } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('timeout')); }, 20000);
    worker.on('message', result => { clearTimeout(timer); void worker.terminate(); result.error ? reject(new Error('search')) : resolve(result.journeys); });
    worker.on('error', () => { clearTimeout(timer); reject(new Error('worker')); });
    worker.on('exit', code => { clearTimeout(timer); if (code !== 0) reject(new Error('worker exit')); });
  });
}
function authorized(value: string | undefined, token: string): boolean {
  const a = Buffer.from(value ?? ''), b = Buffer.from(`Bearer ${token}`);
  return !!token && a.length === b.length && timingSafeEqual(a, b);
}
async function body(request: IncomingMessage): Promise<unknown> {
  let size = 0; const chunks: Buffer[] = [];
  for await (const chunk of request) { size += chunk.length; if (size > 8192) throw new Error('body'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString());
}
export function service(catalog: ServiceCatalog, config: { origins: string[]; adminToken: string; publicApi?: boolean; search?: typeof search }) {
  let running = 0, refreshRequested = 0;
  const rates = new Map<string, { time: number; count: number }>();
  return createServer(async (request, response) => {
    const send = (status: number, data: unknown) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); response.end(JSON.stringify(data)); };
    const origin = request.headers.origin;
    const path = request.url?.split('?')[0];
    const publicEndpoint = config.publicApi === true && (path === '/v1/catalog' || path === '/v1/journeys');
    response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer'); response.setHeader('Vary', 'Origin');
    if (origin && !publicEndpoint && !config.origins.includes(origin)) { send(403, { error: 'origin' }); return; }
    if (publicEndpoint) response.setHeader('Access-Control-Allow-Origin', '*');
    else if (origin) response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Headers', publicEndpoint ? 'Content-Type' : 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
    if (path === '/' && request.method === 'GET') {
      response.setHeader('Content-Security-Policy', "default-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end('<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Transit HUD</title><h1>Transit HUD</h1><p>乗車案内サーバーは起動しています。利用者はEven HubのTransit HUDから駅とルートを選択してください。</p><p><a href="/admin">運用者向け管理ページ</a> · <a href="/healthz">接続確認</a></p></html>');
      return;
    }
    if ((path === '/admin' || path === '/admin.js') && request.method === 'GET') {
      response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      try { const file = await readFile(resolve(process.cwd(), 'server', path === '/admin' ? 'admin.html' : 'admin.js')); response.writeHead(200, { 'Content-Type': path === '/admin' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8' }); response.end(file); } catch { send(404, { error: 'not found' }); }
      return;
    }
    if (path === '/healthz') { send(200, { ok: true }); return; }
    const now = Date.now(), key = request.socket.remoteAddress ?? 'unknown';
    if (rates.size > 10000) for (const [k, v] of rates) if (now - v.time > 60000) rates.delete(k);
    const rate = rates.get(key);
    if (rate && now - rate.time < 60000) { if (++rate.count > 120) { send(429, { error: 'rate limit' }); return; } }
    else rates.set(key, { time: now, count: 1 });
    try {
      if (path === '/admin/status' || path === '/admin/refresh') {
        if (!authorized(request.headers.authorization, config.adminToken)) { send(401, { error: 'unauthorized' }); return; }
        if (path === '/admin/refresh' && request.method === 'POST') {
          if (now - refreshRequested < 60000) { send(429, { error: 'refresh cooldown' }); return; }
          refreshRequested = now; await catalog.refresh(true);
        } else if (request.method !== 'GET' || path !== '/admin/status') { send(405, { error: 'method' }); return; }
        send(200, { feeds: catalog.statuses }); return;
      }
      if (path !== '/v1/catalog' && path !== '/v1/journeys') { send(404, { error: 'not found' }); return; }
      if (path === '/v1/catalog' && request.method !== 'GET' || path === '/v1/journeys' && request.method !== 'POST') { send(405, { error: 'method' }); return; }
      if (running >= 2) { send(503, { error: 'busy' }); return; }
      running++;
      try {
        await catalog.refresh(); const data = catalog.data(now);
        if (path === '/v1/catalog') {
          // Only station/line references and attribution; never publish raw trips/calendars.
          const usage = new Map<string, Set<string>>();
          for (const trip of data.trips) for (const stop of trip.stops) { const set = usage.get(stop.stopId) ?? new Set<string>(); set.add(trip.routeId); usage.set(stop.stopId, set); }
          send(200, { schema: 1, id: data.id, title: 'オンライン管理の時刻表', source: data.source, license: data.license,
            importedAt: data.importedAt, validUntil: data.validUntil, timezone: 'Asia/Tokyo', demo: false, serverManaged: true,
            stations: data.stations.map(s => ({ id: s.id, name: s.name, lineIds: [...(usage.get(s.id) ?? [])] })), lines: data.lines.map(l => ({ id: l.id, name: l.name })), trips: [], calendars: [], exceptions: [], transfers: [] });
        } else {
          if (!request.headers['content-type']?.startsWith('application/json')) { send(415, { error: 'content type' }); return; }
          const favorite = await body(request) as FavoriteRoute;
          validateFavorite(favorite, data);
          const journeys = await (config.search ?? search)(data, favorite, now);
          if (catalog.data().id !== data.id) throw new Error('Catalog changed during search');
          // Selection of a normal route, not a timetable dump endpoint. No user-supplied clock or unbounded date search.
          send(200, { journeys: journeys.slice(0, 7), expiresAt: now + 60000, date: jstDate(now) });
        }
      } finally { running--; }
    } catch { if (!response.headersSent) send(503, { error: '案内を取得できません。駅・時刻表・接続状態を確認してください' }); else response.end(); }
  });
}
