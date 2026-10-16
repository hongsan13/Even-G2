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
