import { MAX_ONLINE_FEEDS } from './settings';
import { ALL_FEEDS, isAuthFeed } from '../src/config';
import { parseGtfsZip } from '../src/transit/gtfs/parser';
import { refreshGtfs } from '../src/transit/gtfs/loader';
import { refreshAuthGtfs, FeedImportError, type FeedFailure } from '../src/transit/odpt/authGtfs';
import { mergeFeeds, type SavedFeed } from '../src/transit/feeds';
import { PUBLIC_FEED_ORIGINS, TOEI_FEED } from '../src/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { jstDate } from '../src/utils/time';
import { loadJsonRoute, type JsonRoute } from './odpt-json';
import type { Timetable, Transfer } from '../src/transit/types';
export class Catalog {
  private feeds: SavedFeed[] = [];
  private refreshing?: Promise<void>;
  private lastAttempt = 0;
  statuses: { id: string; title: string; status: string; reason?: FeedFailure }[] = [];
  constructor(private config: { feeds: string[]; odptKey?: string; challengeKey?: string; restrictedApproved: boolean; jsonRoutes?: JsonRoute[]; links?: Transfer[] }) {
    if ((!config.feeds.length && !config.jsonRoutes?.length) || new Set(config.feeds).size !== config.feeds.length || config.feeds.length + (config.jsonRoutes?.length ?? 0) > MAX_ONLINE_FEEDS || config.feeds.some(id => !ALL_FEEDS.some(f => f.id === id))) throw new Error('TRANSIT_FEEDS must select 1–16 catalog IDs');
  }
  async refresh(force = false): Promise<void> {
    this.feeds = this.feeds.filter(f => !f.data.licenseUntil || f.data.licenseUntil >= jstDate(Date.now()));
    if (this.refreshing) return this.refreshing;
    if (!force && Date.now() - this.lastAttempt < 86400000) return;
    this.lastAttempt = Date.now();
    this.refreshing = this.update().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private async update(): Promise<void> {
    this.statuses = [];
    for (const id of this.config.feeds) {
      const feed = ALL_FEEDS.find(f => f.id === id)!;
      const existing = this.feeds.find(f => f.feedId === id);
      try {
        if (isAuthFeed(feed) && !this.config.restrictedApproved) { this.statuses.push({id,title:feed.title,status:'approval-required'}); continue; }
        if (isAuthFeed(feed) && !(feed.auth === 'challenge' ? this.config.challengeKey : this.config.odptKey)?.trim()) { this.statuses.push({id,title:feed.title,status:feed.auth === 'challenge' ? 'challenge-key-missing' : 'odpt-key-missing'}); continue; }
        const parse = async (bytes: ArrayBuffer) => parseGtfsZip(new Uint8Array(bytes), feed);
        let next;
        if (id === 'toei' && !existing) {
          const bytes = await readFile(resolve(process.cwd(), 'public', TOEI_FEED.bundle.slice(1)));
          const bundled = { data: parseGtfsZip(bytes, feed), checkedAt: 0 };
          const result = await refreshGtfs(feed.url, PUBLIC_FEED_ORIGINS, feed, bundled, parse);
          next = result.cache;
        } else {
          const result = isAuthFeed(feed)
            ? await refreshAuthGtfs(feed, feed.auth === 'challenge' ? this.config.challengeKey ?? '' : this.config.odptKey ?? '', existing, parse)
            : await refreshGtfs(feed.url, PUBLIC_FEED_ORIGINS, feed, existing, parse);
          if (result.fallback) throw new FeedImportError('reason' in result ? result.reason ?? 'network' : 'network');
          next = result.cache;
        }
        if (next.data.validUntil && next.data.validUntil < jstDate(Date.now())) throw new FeedImportError('expired-data');
        const proposed = [...this.feeds.filter(f => f.feedId !== id), { data: next.data, checkedAt: Date.now(), feedId: id }];
        try { mergeFeeds(proposed, [], MAX_ONLINE_FEEDS); } catch { throw new FeedImportError('merge-limit'); } // Retain a working generation.
        this.feeds = proposed;
        this.statuses.push({ id, title: feed.title, status: 'ready' });
      } catch (error) { this.statuses.push({ id, title: feed.title, status: existing ? 'update-failed' : 'unavailable', reason: error instanceof FeedImportError ? error.reason : undefined }); }
    }
    for (const route of this.config.jsonRoutes ?? []) {
      const existing = this.feeds.find(f => f.feedId === route.id);
      let status = 'ready';
      if (!this.config.restrictedApproved) status = 'approval-required';
      else if (!route.files && !this.config.challengeKey?.trim()) status = 'challenge-key-missing';
      else if (route.meta.end < jstDate(Date.now()) || route.meta.licenseUntil && route.meta.licenseUntil < jstDate(Date.now())) status = 'expired';
      else try {
        const data = await loadJsonRoute(route, this.config.challengeKey ?? '');
        const proposed = [...this.feeds.filter(f => f.feedId !== route.id), {data, checkedAt:Date.now(),feedId:route.id}];
        mergeFeeds(proposed, [], MAX_ONLINE_FEEDS); this.feeds = proposed;
      } catch { status = existing ? 'update-failed' : 'unavailable'; }
      this.statuses.push({id:route.id,title:route.meta.title,status});
    }
  }
  data(now = Date.now()): Timetable {
    const today = jstDate(now);
    const usable = this.feeds.filter(f => (!f.data.licenseUntil || f.data.licenseUntil >= today) && (!f.data.validUntil || f.data.validUntil >= today)
      && now - f.checkedAt < 48 * 3600000);
    // Remove expired licence data from process memory, including expired backup generations.
    this.feeds = this.feeds.filter(f => !f.data.licenseUntil || f.data.licenseUntil >= today);
    if (!usable.length) throw new Error('No usable timetable');
    const d = mergeFeeds(usable, this.config.links ?? [], MAX_ONLINE_FEEDS).data;
    return { ...d, id: `online-${usable.map(f => `${f.feedId}-${f.checkedAt}`).join('_')}` };
  }
}
