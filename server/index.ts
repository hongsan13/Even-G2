import { Catalog } from './catalog';
import { service } from './app';
const port = Number(process.env.PORT ?? '8080');
const origins = (process.env.TRANSIT_ALLOWED_ORIGINS ?? '').split(',').map(s => s.trim()).filter(Boolean);
if (!origins.length) throw new Error('Set TRANSIT_ALLOWED_ORIGINS to exact Even Hub WebView origins');
const catalog = new Catalog({ feeds: (process.env.TRANSIT_FEEDS ?? 'toei').split(',').map(s => s.trim()),
  odptKey: process.env.ODPT_KEY, challengeKey: process.env.ODPT_CHALLENGE_KEY,
  restrictedApproved: process.env.ODPT_SERVICE_TERMS_CONFIRMED === 'true' });
const server = service(catalog, { origins, adminToken: process.env.TRANSIT_ADMIN_TOKEN ?? '' });
server.requestTimeout = 30000; server.headersTimeout = 10000;
server.listen(port, '0.0.0.0', () => console.log(`Transit service listening on ${port}`));
const interval = setInterval(() => { void catalog.refresh(); }, 3600000); interval.unref();
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { clearInterval(interval); server.close(() => process.exit(0)); });
