import type { Timetable, Transfer } from './types';
import type { RemoteCache } from './gtfs/loader';
import { TOEI_FEED } from '../config';
import { jstDate } from '../utils/time';
import { applyEdits, retainEdits } from './edits';
import type { OdptMetadata } from './odpt/parser';
export interface SavedFeed extends RemoteCache { feedId: string; url?: string; odpt?: { operator: string; railway: string; meta: OdptMetadata } }
export const MAX_FEEDS = 8;
export function savedFeeds(cache?: RemoteCache): SavedFeed[] {
  if (!cache) return [];
  if (cache.feeds) return cache.feeds.map(f => f.feedId === 'toei' && !f.url ? { ...f, url: TOEI_FEED.url } : f);
  const toei = cache.data.stations.some(s => s.id === '438' && s.name === '練馬春日町') && cache.data.lines.some(l => l.id === '4');
  return [{ ...cache, feedId: toei ? 'toei' : 'legacy', url: toei ? TOEI_FEED.url : undefined }];
}
export function mergeFeeds(feeds: SavedFeed[], links: Transfer[] = []): RemoteCache {
  if (!feeds.length || feeds.length > MAX_FEEDS || new Set(feeds.map(f => f.feedId)).size !== feeds.length) throw new Error('保存するデータは重複なしで1〜8件にしてください');
  const mapped = feeds.map(feed => {
    const d = feed.data;
    const p = (id: string) => ['legacy', 'toei'].includes(feed.feedId) ? id : `${feed.feedId}::${id}`;
    return { ...d,
      stations: d.stations.map(s => ({ ...s, id: p(s.id), parentId: s.parentId ? p(s.parentId) : undefined })),
      lines: d.lines.map(l => ({ ...l, id: p(l.id), agencyId: l.agencyId ? p(l.agencyId) : undefined })),
      trips: d.trips.map(t => ({ ...t, id: p(t.id), routeId: p(t.routeId), serviceId: p(t.serviceId), stops: t.stops.map(s => ({ ...s, stopId: p(s.stopId) })) })),
      calendars: d.calendars.map(c => ({ ...c, id: p(c.id), end: d.validUntil && d.validUntil < c.end ? d.validUntil : c.end })),
      exceptions: d.exceptions.filter(e => !d.validUntil || e.date <= d.validUntil).map(e => ({ ...e, serviceId: p(e.serviceId) })),
      transfers: d.transfers.map(t => ({ ...t, from: p(t.from), to: p(t.to) })) };
  });
  const stations = mapped.flatMap(d => d.stations), lines = mapped.flatMap(d => d.lines), trips = mapped.flatMap(d => d.trips);
  if ([stations, lines, trips].some(items => new Set(items.map(x => x.id)).size !== items.length)) throw new Error('データのIDが重複しています。重複する配布元を置き換えてください');
  if (trips.length > 40_000 || stations.length > 10_000) throw new Error('端末の検索上限を超えます。利用する地域を絞ってください');
  const stationIds = new Set(stations.map(s => s.id));
  const transfers = mapped.flatMap(d => d.transfers);
  for (const link of links) {
    if (!stationIds.has(link.from) || !stationIds.has(link.to) || link.from === link.to || !Number.isInteger(link.seconds) || link.seconds < 0 || link.seconds > 7200) throw new Error('連絡する駅と徒歩時間を確認してください');
    if (transfers.some(t => t.from === link.from && t.to === link.to && t.prohibited)) throw new Error('公式データで禁止されている乗換は追加できません');
  }
  const data: Timetable = { schema: 1, id: crypto.randomUUID(), title: feeds.length === 1 ? feeds[0].data.title : `${feeds.length}件の保存済み時刻表`, timezone: 'Asia/Tokyo',
    source: feeds.map(f => f.data.source).join(' / '), license: feeds.map(f => f.data.license).join(' / '),
    importedAt: Math.max(...feeds.map(f => f.data.importedAt)), demo: feeds.some(f => f.data.demo),
    version: feeds.map(f => f.data.version ?? '記載なし').join(' / '), validUntil: feeds.map(f => f.data.validUntil ?? '').sort().at(-1) || undefined,
    stations, lines, trips, calendars: mapped.flatMap(d => d.calendars), exceptions: mapped.flatMap(d => d.exceptions), transfers: [...links, ...transfers] };
  return { data, feeds, links, checkedAt: Math.min(...feeds.map(f => f.checkedAt)) };
}
export function putFeed(cache: RemoteCache | undefined, next: SavedFeed): RemoteCache {
  const feeds = [...savedFeeds(cache).filter(f => f.feedId !== next.feedId && !f.data.demo), next];
  const merged = mergeFeeds(feeds);
  const ids = new Set(merged.data.stations.map(s => s.id));
  return mergeFeeds(feeds, (cache?.links ?? []).filter(l => ids.has(l.from) && ids.has(l.to)));
}

export function removeExpiredLicensedFeeds(cache: RemoteCache | undefined, now = Date.now()): RemoteCache | undefined {
  if (!cache) return cache;
  const feeds = savedFeeds(cache), kept = feeds.filter(f => !f.data.licenseUntil || f.data.licenseUntil >= jstDate(now));
  if (kept.length === feeds.length) return cache;
  if (!kept.length) return undefined;
  const merged = mergeFeeds(kept);
  const ids = new Set(merged.data.stations.map(s => s.id));
  const result = mergeFeeds(kept, (cache.links ?? []).filter(l => ids.has(l.from) && ids.has(l.to)));
  const edits = retainEdits(result.data, cache.edits ?? []);
  return { ...result, edits, data: applyEdits(result.data, edits) };
}
