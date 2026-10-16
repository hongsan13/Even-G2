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
