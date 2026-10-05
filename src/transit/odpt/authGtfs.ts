import { AUTH_FEEDS, type AuthFeed } from '../../config';
import { importGtfs, boundedResponse, type RemoteCache } from '../gtfs/loader';
import { MAX_ZIP_BYTES } from '../gtfs/parser';
import { jstDate } from '../../utils/time';
import type { Timetable } from '../types';
export function protectTimetable(data: Timetable, licenseUntil?: string): Timetable {
  const validUntil = licenseUntil && (!data.validUntil || licenseUntil < data.validUntil) ? licenseUntil : data.validUntil;
  return { ...data, licenseUntil, validUntil, trips: data.trips.map(t => ({ ...t, readOnly: true })),
    calendars: data.calendars.map(c => ({ ...c, end: validUntil && validUntil < c.end ? validUntil : c.end })),
    exceptions: data.exceptions.filter(e => !validUntil || e.date <= validUntil) };
}
export async function refreshAuthGtfs(feed: AuthFeed, key: string, cache?: RemoteCache,
  parse: typeof importGtfs = importGtfs): Promise<{ cache: RemoteCache; fallback: boolean }> {
  if (!AUTH_FEEDS.some(f => f.id === feed.id && f.url === feed.url)) throw new Error('確認済みの公式配信元を選択してください');
  if (feed.licenseUntil && jstDate(Date.now()) > feed.licenseUntil) throw new Error('この配信の許諾期間が終了しています');
  if (!key.trim()) throw new Error('ODPT認証設定で必要なトークンを入力してください');
  const original = new URL(feed.url), request = new URL(feed.url);
  request.searchParams.set('acl:consumerKey', key);
  try {
    const response = await fetch(request, { credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error('request');
    if (response.url) {
      const final = new URL(response.url);
      const suffix = original.pathname.replace('/api/v4/files/', '/');
      // Container names vary by licence. Require the exact provider/path/filename on ODPT Azure.
      const azure = final.origin === 'https://dataodpt.blob.core.windows.net' && final.pathname.endsWith(suffix) &&
        /^\/[A-Za-z0-9_-]+\//.test(final.pathname) && final.pathname.split('/').length === suffix.split('/').length + 1;
      if (!azure && !(final.origin === original.origin && final.pathname === original.pathname)) throw new Error('redirect');
    }
    const data = protectTimetable(await parse(await boundedResponse(response, MAX_ZIP_BYTES), feed), feed.licenseUntil);
    return { cache: { data, checkedAt: Date.now() }, fallback: false };
  } catch {
    if (cache && (!cache.data.licenseUntil || cache.data.licenseUntil >= jstDate(Date.now()))) return { cache, fallback: true };
    // Fetch errors may include the request URL. Do not propagate them or a signed redirect.
    throw new Error('認証付きGTFSを取得できません。トークンの種類・利用条件・ネットワーク権限を確認してください');
  }
}
