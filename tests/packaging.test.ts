import { expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
it('オンライン接続先だけを一時manifestへ許可し、鍵入りURLやHTTPを拒否', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { serviceManifest } from './scripts/service-manifest.mjs';
    const original={ permissions:[{name:'network',whitelist:['https://api-public.odpt.org']}] };
    const manifest=serviceManifest(original,'https://transit-service.example/');
    assert.deepEqual(manifest.permissions[0].whitelist,['https://api-public.odpt.org','https://transit-service.example']);
    assert.deepEqual(original.permissions[0].whitelist,['https://api-public.odpt.org']);
    for(const url of ['http://localhost:8080','https://example.com/?key=synthetic','https://user:synthetic@example.com','https://example.com/path']) assert.throws(()=>serviceManifest(original,url));
    assert.deepEqual(serviceManifest(original,''),original);
  `], { encoding:'utf8' });
  expect(result.stderr).toBe(''); expect(result.status).toBe(0);
});
