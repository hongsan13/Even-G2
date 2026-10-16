import { readFile, stat } from 'node:fs/promises';
import { fetchOdpt, JSON_LIMIT, ODPT_OPERATORS, CHALLENGE_END } from '../src/transit/odpt/loader';
import { parseOdpt, type OdptMetadata } from '../src/transit/odpt/parser';
import { jstDate, serviceMidnight } from '../src/utils/time';

export interface JsonRoute {
  id: string; operator: string; railway: string; meta: OdptMetadata;
  files?: { railways: string; stations: string; trains: string };
}
/** Operator-owned environment configuration, never supplied through the public API. */
export function jsonRoutes(value = ''): JsonRoute[] {
  const routes: unknown = value ? JSON.parse(value) : [];
  if (!Array.isArray(routes) || routes.length > 8) throw new Error('Configure at most eight JSON routes');
  for (const r of routes) {
    if (!r || typeof r !== 'object' || !/^json-[a-zA-Z0-9-]{1,60}$/.test(r.id) || typeof r.operator !== 'string' || typeof r.railway !== 'string' ||
      !r.railway.startsWith(`odpt.Railway:${r.operator}.`) || !r.meta || typeof r.meta !== 'object' ||
      !['title','source','license','start','end'].every(k => typeof r.meta[k] === 'string' && r.meta[k].trim()) ||
      !Array.isArray(r.meta.holidays) || !r.meta.holidays.every((d: unknown) => typeof d === 'string')) throw new Error('Invalid JSON route configuration');
    serviceMidnight(r.meta.start); serviceMidnight(r.meta.end);
    if (r.meta.start > r.meta.end) throw new Error('Invalid JSON validity period');
    if (r.meta.licenseUntil) serviceMidnight(r.meta.licenseUntil);
    if (r.files) {
      if (!['railways','stations','trains'].every(k => typeof r.files[k] === 'string' && r.files[k].length > 0)) throw new Error('Configure three local JSON paths');
    } else if (!ODPT_OPERATORS.some(o => o.id === r.operator) || !r.meta.licenseUntil || r.meta.end > CHALLENGE_END || r.meta.licenseUntil > CHALLENGE_END) {
      throw new Error('Challenge JSON requires a supported operator and explicit licence expiry');
    }
  }
  if (new Set(routes.map(r => r.id)).size !== routes.length) throw new Error('Duplicate JSON route');
  return routes;
}
export async function loadJsonRoute(route: JsonRoute, challengeKey: string) {
  if (route.meta.end < jstDate(Date.now()) || route.meta.licenseUntil && route.meta.licenseUntil < jstDate(Date.now())) throw new Error('Expired JSON route');
  let inputs: unknown[];
  if (route.files) {
    inputs = [];
    for (const path of [route.files.railways, route.files.stations, route.files.trains]) {
      if ((await stat(path)).size > JSON_LIMIT) throw new Error('JSON file exceeds limit');
      inputs.push(JSON.parse(await readFile(path, 'utf8')));
    }
  } else {
    inputs = [];
    // Sequential requests keep the provider load bounded; capped responses fail closed.
    for (const kind of ['Railway','Station','TrainTimetable'] as const) inputs.push(await fetchOdpt(kind, route.operator, challengeKey, route.railway));
  }
  return parseOdpt(inputs[0], inputs[1], inputs[2], route.meta);
}
