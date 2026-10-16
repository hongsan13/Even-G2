import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serviceLinks } from '../server/settings';
import { Catalog } from '../server/catalog';
import { jsonRoutes, loadJsonRoute } from '../server/odpt-json';
import { railways, stations, trains, meta, railway, stationA, stationB } from './odptFixtures';
const route = { id:'json-test', operator:'JR-East', railway, meta:{...meta,licenseUntil:'20270312'} };
afterEach(() => { vi.unstubAllGlobals(); });
function api() {
  const fetch = vi.fn(async (url: URL) => new Response(JSON.stringify(url.pathname.endsWith('Railway') ? railways : url.pathname.endsWith('Station') ? stations : trains)));
  vi.stubGlobal('fetch', fetch); return fetch;
}
it('JSON経路は未知の事業者・期間未指定・重複IDを起動時に拒否', () => {
  expect(jsonRoutes(JSON.stringify([route]))).toHaveLength(1);
  expect(() => jsonRoutes(JSON.stringify([{...route,operator:'Unknown'}]))).toThrow();
  expect(() => jsonRoutes(JSON.stringify([{...route,meta:{...meta}}]))).toThrow();
  expect(() => jsonRoutes(JSON.stringify([route,route]))).toThrow('Duplicate');
});
it('サーバーJSONは路線別に取得し、鍵と原データのURLを時刻表へ保存しない', async () => {
  const fetch = api();
  const d = await loadJsonRoute(route,'synthetic-private-key');
  expect(d.trips).toHaveLength(1); expect(d.trips[0].readOnly).toBe(true);
  expect(d.licenseUntil).toBe('20270312');
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(fetch.mock.calls.every(([url]) => url.searchParams.get('acl:consumerKey') === 'synthetic-private-key')).toBe(true);
  expect(JSON.stringify(d)).not.toContain('synthetic-private-key');
});
it('許諾確認と専用鍵が揃うまで要求せず、管理状態へ理由を出す', async () => {
  const fetch = api();
  const blocked = new Catalog({feeds:[],jsonRoutes:[route],restrictedApproved:false});
  await blocked.refresh(); expect(blocked.statuses[0].status).toBe('approval-required');
  const missing = new Catalog({feeds:[],jsonRoutes:[route],restrictedApproved:true});
  await missing.refresh(); expect(missing.statuses[0].status).toBe('challenge-key-missing');
  expect(fetch).not.toHaveBeenCalled();
  const normal = new Catalog({feeds:['auth-TokyoMetro'],restrictedApproved:true});
  await normal.refresh(); expect(normal.statuses[0].status).toBe('odpt-key-missing');
});
it('JSONを統合し、明示した事業者間連絡だけ追加。更新失敗では保存済みを維持', async () => {
  const fetch = api();
  const catalog = new Catalog({feeds:[],jsonRoutes:[route,{...route,id:'json-second'}],restrictedApproved:true,challengeKey:'synthetic-private-key',
    links:[{from:`json-test::${stationB}`,to:`json-second::${stationA}`,seconds:300,prohibited:false}]});
  await catalog.refresh(); const d = catalog.data();
  expect(d.trips).toHaveLength(2); expect(d.transfers).toHaveLength(1); expect(d.transfers[0].seconds).toBe(300);
  expect(JSON.stringify(catalog.statuses)).not.toContain('synthetic-private-key');
  fetch.mockImplementation(async () => { throw new Error('private upstream URL'); });
  await catalog.refresh(true); expect(catalog.statuses[0].status).toBe('update-failed'); expect(catalog.data().trips).toHaveLength(2);
});
it('許諾のある公式JSONファイルもサーバーから取り込める', async () => {
  const dir = await mkdtemp(join(tmpdir(),'transit-json-'));
  try {
    const files = {railways:join(dir,'railways.json'),stations:join(dir,'stations.json'),trains:join(dir,'trains.json')};
    await Promise.all([writeFile(files.railways,JSON.stringify(railways)),writeFile(files.stations,JSON.stringify(stations)),writeFile(files.trains,JSON.stringify(trains))]);
    const config = jsonRoutes(JSON.stringify([{...route,files}]));
    const catalog = new Catalog({feeds:[],jsonRoutes:config,restrictedApproved:true});
    await catalog.refresh(); expect(catalog.statuses[0].status).toBe('ready'); expect(catalog.data().trips).toHaveLength(1);
  } finally { await rm(dir,{recursive:true,force:true}); }
});

it('事業者間連絡は型と徒歩時間を検証し、逆方向を自動生成しない', () => {
  expect(serviceLinks('[{"from":"a","to":"b","seconds":300}]')).toEqual([{from:'a',to:'b',seconds:300,prohibited:false}]);
  expect(() => serviceLinks('null')).toThrow();
  expect(() => serviceLinks('[{"from":"a","to":"b","seconds":-1}]')).toThrow();
});
it('管理状態は認証GTFSのHTTPコードを保持し、認証鍵を含めない', async () => {
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async () => new Response('synthetic-private-key',{status:403})));
  const catalog = new Catalog({feeds:['auth-TokyoMetro'],restrictedApproved:true,odptKey:'synthetic-private-key'});
  await catalog.refresh();
  expect(catalog.statuses[0]).toMatchObject({status:'unavailable',reason:'http-403'});
  expect(JSON.stringify(catalog.statuses)).not.toContain('synthetic-private-key');
});

it('オンラインは9配布元を統合でき、端末版の上限8件は維持する', async () => {
  api();
  const routes = Array.from({length:9},(_,i)=>({...route,id:`json-${i}`}));
  const catalog = new Catalog({feeds:[],jsonRoutes:routes,restrictedApproved:true,challengeKey:'synthetic-key'});
  await catalog.refresh(); expect(catalog.data().trips).toHaveLength(9);
  expect(catalog.statuses.every(s=>s.status==='ready')).toBe(true);
});
