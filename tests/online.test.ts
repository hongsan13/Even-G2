import { afterEach, expect, it, vi } from 'vitest';
import { onlineCatalog, onlineJourneys } from '../src/transit/online';
import { data, favorite } from './fixtures';
import { Catalog } from '../server/catalog';
afterEach(() => vi.unstubAllGlobals());
it('駅一覧から時刻表や未知のフィールドを保存せず、同名駅の路線を保持', async () => {
  const d = { ...data(), serverManaged:true, extra:'synthetic-unused-field' };
  d.stations[0].lineIds=['L1']; vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify(d))));
  const result = await onlineCatalog('https://service.example');
  expect(result.trips).toEqual([]); expect(result.calendars).toEqual([]); expect(result.stations[0].lineIds).toEqual(['L1']);
  expect(JSON.stringify(result)).not.toContain('synthetic-unused-field');
});
it('経路検索で個人のルート名を送らず、期限切れ応答を拒否', async () => {
  const mock=vi.fn().mockResolvedValue(new Response(JSON.stringify({ journeys:[], expiresAt:Date.now()-1 })));
  vi.stubGlobal('fetch',mock);
  await expect(onlineJourneys('https://service.example',data(),favorite({name:'自宅の個人ラベル'}),new AbortController().signal)).rejects.toThrow('期限');
  expect(mock.mock.calls[0][1].body).not.toContain('自宅の個人ラベル');
  expect(mock.mock.calls[0][1].credentials).toBe('omit');
});
it('提供許諾の確認前には認証事業者を取得せず、トークンを公開しない', async () => {
  const mock=vi.fn();vi.stubGlobal('fetch',mock);
  const catalog=new Catalog({feeds:['auth-TokyoMetro'],odptKey:'synthetic-private-token',restrictedApproved:false});
  await catalog.refresh(); expect(mock).not.toHaveBeenCalled(); expect(()=>catalog.data()).toThrow('No usable');
  expect(JSON.stringify(catalog.statuses)).not.toContain('synthetic-private-token');
});
