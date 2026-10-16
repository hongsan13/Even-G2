import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { serviceManifest } from './service-manifest.mjs';
const manifest = serviceManifest(JSON.parse(await readFile('app.json', 'utf8')), process.env.TRANSIT_SERVICE_URL);
const temp = await mkdtemp(join(tmpdir(), 'transit-manifest-'));
try {
  const path = join(temp, 'app.json'); await writeFile(path, JSON.stringify(manifest));
  const result = spawnSync('node_modules/.bin/evenhub', ['pack', path, 'dist', '--sdk-ver', '0.0.16', '-o', `releases/transit-hud-${manifest.version}.ehpk`], { stdio: 'inherit' });
  if (result.status !== 0) process.exitCode = result.status ?? 1;
} finally { await rm(temp, { recursive: true, force: true }); }
