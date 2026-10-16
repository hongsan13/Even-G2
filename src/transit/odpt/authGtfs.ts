import { AUTH_FEEDS, type AuthFeed } from '../../config';
import { importGtfs, boundedResponse, type RemoteCache } from '../gtfs/loader';
import { MAX_ZIP_BYTES } from '../gtfs/parser';
import { jstDate } from '../../utils/time';
import type { Timetable } from '../types';
export type FeedFailure = 'network' | 'timeout' | 'redirect' | 'download' | 'parse' | 'size-limit' | 'merge-limit' | 'expired-data' | `http-${number}`;
export class FeedImportError extends Error {
  constructor(public readonly reason: FeedFailure) {
    super(`認証付きGTFSを取得できません (${reason})。管理画面で取得状態を確認してください`);
  }
}
export function protectTimetable(data: Timetable, licenseUntil?: string): Timetable {
  const validUntil = licenseUntil && (!data.validUntil || licenseUntil < data.validUntil) ? licenseUntil : data.validUntil;
  return { ...data, licenseUntil, validUntil, trips: data.trips.map(t => ({ ...t, readOnly: true })),
    calendars: data.calendars.map(c => ({ ...c, end: validUntil && validUntil < c.end ? validUntil : c.end })),
    exceptions: data.exceptions.filter(e => !validUntil || e.date <= validUntil) };
}
export async function refreshAuthGtfs(feed: AuthFeed, key: string, cache?: RemoteCache,
  parse: typeof importGtfs = importGtfs): Promise<{ cache: RemoteCache; fallback: boolean; reason?: FeedFailure }> {
  if (!AUTH_FEEDS.some(f => f.id === feed.id && f.url === feed.url)) throw new Error('確認済みの公式配信元を選択してください');
  if (feed.licenseUntil && jstDate(Date.now()) > feed.licenseUntil) throw new Error('この配信の許諾期間が終了しています');
  if (!key.trim()) throw new Error('ODPT認証設定で必要なトークンを入力してください');
  const original = new URL(feed.url), request = new URL(feed.url);
  request.searchParams.set('acl:consumerKey', key.trim());
  let stage: FeedFailure = 'network';
  try {
    const response = await fetch(request, { credentials: 'omit', cache: 'no-store', redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new FeedImportError(`http-${response.status}`);
    stage = 'redirect';
    if (response.url) {
      const final = new URL(response.url);
      const date = original.searchParams.get('date');
      const suffix = original.pathname.replace('/api/v4/files/', '/').replace(/\.zip$/, date ? `-${date}.zip` : '.zip');
      // Container names vary by licence. Require the exact provider/path/filename on ODPT Azure.
      const azure = final.origin === 'https://dataodpt.blob.core.windows.net' && final.pathname.endsWith(suffix) &&
        /^\/[A-Za-z0-9_-]+\//.test(final.pathname) && final.pathname.split('/').length === suffix.split('/').length + 1;
      if (!azure && !(final.origin === original.origin && final.pathname === original.pathname && final.searchParams.get('date') === original.searchParams.get('date'))) throw new Error('redirect');
    }
    stage = 'download';
    const bytes = await boundedResponse(response, MAX_ZIP_BYTES);
    stage = 'parse';
    const data = protectTimetable(await parse(bytes, feed), feed.licenseUntil);
    return { cache: { data, checkedAt: Date.now() }, fallback: false };
  } catch (error) {
    const sizeErrors = ['配信ファイルが大きすぎます', 'ZIPは12MB以下に絞ってください', '展開後のGTFSは60MB以下にしてください'];
    const reason: FeedFailure = error instanceof FeedImportError ? error.reason
      : error instanceof Error && sizeErrors.includes(error.message) ? 'size-limit'
      : error instanceof Error && ['TimeoutError','AbortError'].includes(error.name) ? 'timeout' : stage;
    if (cache && (!cache.data.licenseUntil || cache.data.licenseUntil >= jstDate(Date.now()))) return { cache, fallback: true, reason };
    // Fetch errors may include the request URL. Do not propagate them or a signed redirect.
    throw new FeedImportError(reason);
  }
}
