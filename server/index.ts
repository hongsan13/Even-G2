import { jsonRoutes } from './odpt-json';
import { Catalog } from './catalog';
import { service } from './app';
import { serviceOrigins, serviceLinks } from './settings';
const port = Number(process.env.PORT ?? '8080');
const origins = serviceOrigins(process.env.TRANSIT_ALLOWED_ORIGINS, process.env.RENDER_EXTERNAL_URL);
if (!origins.length) console.log('No administration browser origins enabled; configure TRANSIT_ALLOWED_ORIGINS for administration UI access');
const catalog = new Catalog({ feeds: (process.env.TRANSIT_FEEDS ?? 'toei').split(',').map(s => s.trim()).filter(Boolean),
  odptKey: process.env.ODPT_KEY, challengeKey: process.env.ODPT_CHALLENGE_KEY,
  jsonRoutes: jsonRoutes(process.env.TRANSIT_ODPT_JSON_ROUTES),
  links: serviceLinks(process.env.TRANSIT_TRANSFER_LINKS),
  restrictedApproved: process.env.ODPT_SERVICE_TERMS_CONFIRMED === 'true' });
const server = service(catalog, { origins, adminToken: process.env.TRANSIT_ADMIN_TOKEN ?? '', publicApi: process.env.TRANSIT_PUBLIC_API !== 'false' });
server.requestTimeout = 30000; server.headersTimeout = 10000;
server.listen(port, '0.0.0.0', () => console.log(`Transit service listening on ${port}`));
const interval = setInterval(() => { void catalog.refresh(); }, 3600000); interval.unref();
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { clearInterval(interval); server.close(() => process.exit(0)); });
