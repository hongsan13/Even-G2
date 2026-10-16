import { ALL_FEEDS, AUTH_FEEDS } from '../src/config';
export const MAX_ONLINE_FEEDS = 16;
export const KANTO_FEEDS = ['toei', ...AUTH_FEEDS.filter(f => f.region === '関東').map(f => f.id)];
export function serviceFeeds(value = 'toei'): string[] {
  const selected = value.split(',').map(s => s.trim()).filter(Boolean);
  const feeds = [...new Set(selected.flatMap(id => id === 'kanto' ? KANTO_FEEDS : [id]))];
  if (feeds.length > MAX_ONLINE_FEEDS || feeds.some(id => !ALL_FEEDS.some(f => f.id === id))) throw new Error('Unknown or excessive timetable feeds');
  return feeds;
}
import type { Transfer } from '../src/transit/types';
export function serviceLinks(value = '[]'): Transfer[] {
  const links: unknown = JSON.parse(value);
  if (!Array.isArray(links) || links.length > 200) throw new Error('Configure at most 200 station connections');
  return links.map(l => {
    if (!l || typeof l.from !== 'string' || !l.from || typeof l.to !== 'string' || !l.to || l.from === l.to ||
      !Number.isInteger(l.seconds) || l.seconds < 0 || l.seconds > 7200 || l.prohibited !== undefined && typeof l.prohibited !== 'boolean') throw new Error('Invalid station connection');
    return {from:l.from,to:l.to,seconds:l.seconds,prohibited:l.prohibited ?? false};
  });
}
/** Bootstrap same-origin administration without guessing the Hub WebView origin. */
export function serviceOrigins(configured = '', platformUrl = ''): string[] {
  const values = configured.split(',').map(s => s.trim()).filter(Boolean);
  if (platformUrl) values.push(platformUrl);
  return [...new Set(values.map(value => {
    if (value === 'null') return value; // Only when the operator explicitly configures an opaque WebView origin.
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Configure exact service origins, without paths or credentials');
    return url.origin;
  }))];
}
