import type { Timetable } from '../types';
import type { ImportMetadata } from './parser';
import { MAX_ZIP_BYTES } from './parser';
export function importGtfs(bytes: ArrayBuffer, meta: ImportMetadata): Promise<Timetable> {
  if (bytes.byteLength > MAX_ZIP_BYTES) return Promise.reject(new Error('ZIPは12MB以下にしてください'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const timer = setTimeout(() => { worker.terminate(); reject(new Error('GTFS取込がタイムアウトしました。対象地域を絞ってください')); }, 45_000);
    worker.onmessage = event => { clearTimeout(timer); worker.terminate(); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.data); };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); reject(new Error('GTFS処理を開始できませんでした')); };
    worker.postMessage({ bytes, meta }, [bytes]);
  });
}
export interface RemoteCache { links?: import('../types').Transfer[]; edits?: import('../edits').TimetableEdit[]; feeds?: import('../feeds').SavedFeed[]; data: Timetable; etag?: string; lastModified?: string; checkedAt: number }
export function publicHttpsUrl(input: string, origins: string[]): URL {
  const url = new URL(input);
  const datedPublicFeed = url.origin === 'https://api-public.odpt.org' && [...url.searchParams.keys()].length === 1 && /^\d{8}$/.test(url.searchParams.get('date') ?? '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search && !datedPublicFeed || url.hash || !origins.includes(url.origin)) {
    throw new Error('公開HTTPS URLのみ対応。認証・クエリは禁止し、配信元をapp.jsonとCSPで許可してください');
  }
  return url;
}
export async function boundedResponse(response: Response, limit: number): Promise<ArrayBuffer> {
  if (+response.headers.get('Content-Length')! > limit) throw new Error('配信ファイルが大きすぎます');
  const reader = response.body?.getReader();
  if (!reader) throw new Error('配信ファイルを読み取れません');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength;
      if (length > limit) throw new Error('配信ファイルが大きすぎます');
      chunks.push(next.value);
    }
  } catch (error) { await reader.cancel(); throw error; }
  finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes.buffer;
}
export async function refreshGtfs(url: string, origins: string[], meta: ImportMetadata, cache: RemoteCache | undefined,
  parse: typeof importGtfs = importGtfs): Promise<{ cache: RemoteCache; fallback: boolean; error?: string }> {
  publicHttpsUrl(url, origins);
  try {
    const headers: Record<string, string> = {};
    if (cache?.etag) headers['If-None-Match'] = cache.etag;
    else if (cache?.lastModified) headers['If-Modified-Since'] = cache.lastModified;
    const odpt = new URL(url).origin === 'https://api-public.odpt.org';
    if (odpt && !/^\/api\/v4\/files\/(?:[A-Za-z0-9_-]+\/data|odpt\/[A-Za-z0-9_-]+)\/[A-Za-z0-9_.-]+\.zip$/.test(new URL(url).pathname)) throw new Error('ODPTの公開GTFS ZIP URLを指定してください');
    // ODPT issues a short-lived Azure SAS redirect; never store that signed URL.
    const response = await fetch(url, { headers: odpt ? {} : headers, cache: 'no-store', credentials: 'omit', redirect: odpt ? 'follow' : 'error', signal: AbortSignal.timeout(15_000) });
    if (odpt && response.url) {
      const final = new URL(response.url);
      const original = new URL(url);
      const expected = original.pathname.replace('/api/v4/files/', '/files-open/').replace(/\.zip$/, original.searchParams.has('date') ? `-${original.searchParams.get('date')}.zip` : '.zip');
      if (final.origin !== 'https://dataodpt.blob.core.windows.net' || final.pathname !== expected) throw new Error('GTFSの転送先を確認できません');
    }
    if (response.status === 304 && cache) return { cache: { ...cache, checkedAt: Date.now() }, fallback: false };
    if (!response.ok) throw new Error(`GTFS取得失敗 (${response.status})`);
    const data = await parse(await boundedResponse(response, MAX_ZIP_BYTES), meta);
    return { cache: { data, etag: response.headers.get('ETag') ?? undefined,
      lastModified: response.headers.get('Last-Modified') ?? undefined, checkedAt: Date.now() }, fallback: false };
  } catch (error) {
    if (!cache) throw error;
    return { cache, fallback: true, error: error instanceof Error ? error.message : '通信失敗' };
  }
}
