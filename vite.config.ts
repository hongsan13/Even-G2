import { defineConfig } from 'vite';
export default defineConfig(({ command }) => ({
  base: './',
  server: { host: true, port: 5173, strictPort: true },
  build: { target: 'es2022' },
  plugins: command === 'serve' ? [{
    name: 'development-csp',
    transformIndexHtml: (html: string) => html.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")
      .replace("connect-src 'self'", "connect-src 'self' ws://localhost:5173 ws://127.0.0.1:5173"),
  }] : [],
}));
