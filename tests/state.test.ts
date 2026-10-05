import { describe, it, expect } from 'vitest';
import { ChunkStorage, CompressedStorage, DurableCache, type StoragePort } from '../src/state/persistence';
import { readSettings, emptySettings, SETTINGS_KEY, validateFavorite } from '../src/state/store';
import { data, favorite } from './fixtures';
class MemoryStorage implements StoragePort {
  values = new Map<string, string>(); failAfter = Infinity; writes = 0;
  async get(key: string): Promise<string | null> { return this.values.get(key) ?? null; }
  async set(key: string, value: string): Promise<void> {
    if (this.writes++ >= this.failAfter) throw new Error('storage failure');
    this.values.set(key, value);
  }
}
describe('永続保存', () => {
  it('設定を保存して別インスタンスでも復元', async () => {
    const port = new MemoryStorage(), settings = { ...emptySettings(), favorites: [favorite()], activeId: 'fav' };
    await port.set(SETTINGS_KEY, JSON.stringify(settings)); expect(await readSettings(port)).toEqual(settings);
  });
  it('分割キャッシュを復元して旧世代を消去', async () => {
    const port = new MemoryStorage(), cache = new ChunkStorage(port);
    await cache.set('data', '駅'.repeat(70_000)); expect(await new ChunkStorage(port).get('data')).toBe('駅'.repeat(70_000));
    await cache.set('data', 'new'); expect(await cache.get('data')).toBe('new');
    expect([...port.values].filter(([k, v]) => k !== 'data.index' && v === '').length).toBe(3);
  });
  it('保存途中の障害でも旧キャッシュを維持', async () => {
    const port = new MemoryStorage(), cache = new ChunkStorage(port);
    await cache.set('data', 'old'); port.failAfter = port.writes + 1;
    await expect(cache.set('data', 'x'.repeat(70_000))).rejects.toThrow('failure'); expect(await cache.get('data')).toBe('old');
  });
  it('破損設定・不正ルートを拒否', async () => {
    const port = new MemoryStorage(); await port.set(SETTINGS_KEY, '{"schema":2}'); await expect(readSettings(port)).rejects.toThrow();
    expect(() => validateFavorite(favorite({ from: 'missing' }), data())).toThrow();
    expect(() => validateFavorite(favorite({ walkingMinutes: -1 }), data())).toThrow();
  });
});

it('4MBを超える展開データを圧縮してSDK保存し、IDBなしで復元', async () => {
  const native = new MemoryStorage(), browser = new MemoryStorage();
  const text = JSON.stringify(data()).repeat(5000);
  expect(text.length).toBeGreaterThan(4_000_000);
  const cache = new DurableCache(new CompressedStorage(new ChunkStorage(native)), browser);
  await cache.set('data', text);
  browser.values.clear();
  expect(await new DurableCache(new CompressedStorage(new ChunkStorage(native))).get('data')).toBe(text);
});
it('旧IndexedDBキャッシュを移行し、空にしたデータも復活させない', async () => {
  const native = new MemoryStorage(), browser = new MemoryStorage();
  await browser.set('data', 'legacy');
  const cache = new DurableCache(new CompressedStorage(new ChunkStorage(native)), browser);
  expect(await cache.get('data')).toBe('legacy');
  browser.values.clear(); expect(await cache.get('data')).toBe('legacy');
  await cache.set('data', ''); await browser.set('data', 'stale');
  expect(await cache.get('data')).toBe('');
});
