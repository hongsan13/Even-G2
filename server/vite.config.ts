import { defineConfig } from 'vite';
export default defineConfig({ build: { ssr: true, target: 'node24', outDir: 'server-dist',
  rollupOptions: { input: { index: 'server/index.ts', 'search-worker': 'server/search-worker.ts' }, output: { entryFileNames: '[name].js' } } },
  ssr: { noExternal: ['fflate'] } });
