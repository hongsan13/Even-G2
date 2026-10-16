import { afterEach, expect, it, vi } from 'vitest';
import { serviceOrigins } from '../server/settings';
import { service, type ServiceCatalog } from '../server/app';
import { data, favorite } from './fixtures';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
const servers: Server[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map(s => new Promise<void>(r => { s.closeAllConnections(); s.close(() => r()); }))); });
async function start(search = vi.fn().mockResolvedValue([])) {
  const catalog: ServiceCatalog = { refresh: vi.fn().mockResolvedValue(undefined), data: () => data(), statuses: [{ id:'toei', title:'test', status:'ready' }] };
  const server = service(catalog, { origins:['https://hub.example'], adminToken:'synthetic-admin-secret', search }); servers.push(server);
  await new Promise<void>(r => server.listen(0,'127.0.0.1',r));
  return { base:`http://127.0.0.1:${(server.address() as AddressInfo).port}`, catalog, search };
}
it('公開応答は駅・路線だけで時刻表/鍵を公開せず、CORSを限定', async () => {
  const { base } = await start();
  const response = await fetch(`${base}/v1/catalog`,{ headers:{Origin:'https://hub.example'} }); const body = await response.json();
  expect(response.headers.get('access-control-allow-origin')).toBe('https://hub.example');
  expect(response.headers.get('cache-control')).toBe('no-store'); expect(body.serverManaged).toBe(true);
  expect(body.stations).toHaveLength(4); expect(body.trips).toEqual([]); expect(body.calendars).toEqual([]);
  expect(JSON.stringify(body)).not.toContain('synthetic-admin-secret');
  expect((await fetch(`${base}/v1/catalog`, { headers:{Origin:'https://unknown.example'} })).status).toBe(403);
  expect((await fetch(`${base}/v1/raw`)).status).toBe(404);
});
it('管理更新は認証必須で、認証鍵そのものは状態応答へ含めない', async () => {
  const { base, catalog } = await start();
  expect((await fetch(`${base}/admin/refresh`,{method:'POST'})).status).toBe(401);
  const response = await fetch(`${base}/admin/refresh`,{method:'POST',headers:{Authorization:'Bearer synthetic-admin-secret'}});
  expect(response.status).toBe(200); expect(catalog.refresh).toHaveBeenCalledWith(true);
  expect(await response.text()).not.toContain('synthetic-admin-secret');
  expect((await fetch(`${base}/admin/refresh`,{method:'POST',headers:{Authorization:'Bearer synthetic-admin-secret'}})).status).toBe(429);
});
it('検索時刻はサーバーで決め、検証済みルートだけを検索する', async () => {
  const { base, search } = await start();
  const post = (value:unknown) => fetch(`${base}/v1/journeys`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
  expect((await post(favorite())).status).toBe(200); expect(search).toHaveBeenCalledTimes(1);
  expect(search.mock.calls[0][2]).toBeGreaterThan(Date.now()-10000);
  expect((await post(favorite({from:'unknown'}))).status).toBe(503); expect(search).toHaveBeenCalledTimes(1);
  expect((await fetch(`${base}/v1/journeys`)).status).toBe(405);
});
it('巨大要求と検索エラーは一般エラーにし、キーを漏らさない', async () => {
  const { base } = await start(vi.fn().mockRejectedValue(new Error('https://upstream/?consumerKey=synthetic-private-key')));
  const response = await fetch(`${base}/v1/journeys`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(favorite())});
  expect(response.status).toBe(503); expect(await response.text()).not.toContain('synthetic-private-key');
  const large = await fetch(`${base}/v1/journeys`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'x'.repeat(10000)})});
  expect(large.status).toBe(503);
});

it('Renderの自動URLで管理を開始し、Hub originを推測・無条件許可しない', () => {
  expect(serviceOrigins('', 'https://transit-example.onrender.com')).toEqual(['https://transit-example.onrender.com']);
  expect(serviceOrigins('https://hub.example,https://hub.example/', 'https://transit-example.onrender.com')).toEqual(['https://hub.example','https://transit-example.onrender.com']);
  expect(serviceOrigins()).toEqual([]);
  expect(() => serviceOrigins('*')).toThrow();
  expect(() => serviceOrigins('https://user:synthetic@example.com')).toThrow();
  expect(() => serviceOrigins('https://example.com/path')).toThrow();
});
