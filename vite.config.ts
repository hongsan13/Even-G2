import { defineConfig } from 'vite';
const rawService = process.env.TRANSIT_SERVICE_URL ?? '';
const service = rawService ? new URL(rawService) : null;
if (service && (service.username || service.password || service.search || service.hash || service.pathname !== '/' || service.protocol !== 'https:' && !(process.env.TRANSIT_ALLOW_LOCAL_TEST === 'true' && service.protocol === 'http:' && ['127.0.0.1','localhost'].includes(service.hostname)))) throw new Error('TRANSIT_SERVICE_URL must be an HTTPS origin');
export default defineConfig(({ command }) => ({
  define: { __TRANSIT_SERVICE_URL__: JSON.stringify(service?.origin ?? '') },
  base: './',
  server: { host: true, port: 5173, strictPort: true },
  build: { target: 'es2022' },
  plugins: [{ name: 'online-service-csp', transformIndexHtml: (html: string) => service ? html.replace("connect-src 'self'", `connect-src 'self' ${service.origin}`) : html }, ...(command === 'serve' ? [{
    name: 'development-csp',
    transformIndexHtml: (html: string) => html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
      .replace("connect-src 'self'", "connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173"),
  }] : [])],
}));
