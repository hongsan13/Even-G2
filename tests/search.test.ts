import { afterEach, expect, it, vi } from 'vitest';
import { JourneySearch } from '../src/transit/search';
import { data, favorite, time } from './fixtures';
class HostWorker {
  static instances: HostWorker[] = [];
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { HostWorker.instances.push(this); }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); HostWorker.instances = []; });
it('ルート変更で古い検索を中止し、新しい結果だけ返す', async () => {
  vi.stubGlobal('Worker', HostWorker);
  const search = new JourneySearch();
  const old = search.search(data(), favorite(), time('13:30'), []).catch(e => e.message);
  const next = search.search(data(), favorite({ to: 'C' }), time('13:30'), []);
  expect(await old).toBe('検索を更新しました');
  expect(HostWorker.instances[0].terminate).toHaveBeenCalledOnce();
  HostWorker.instances[1].onmessage!({ data: { journeys: [] } });
  expect(await next).toEqual([]);
  expect(HostWorker.instances[1].terminate).toHaveBeenCalledOnce();
});
it('検索が応答しなくても期限で終了し、次の検索を開始できる', async () => {
  vi.useFakeTimers(); vi.stubGlobal('Worker', HostWorker);
  const search = new JourneySearch();
  const stalled = search.search(data(), favorite(), time('13:30'), []).catch(e => e.message);
  await vi.advanceTimersByTimeAsync(30_000);
  expect(await stalled).toContain('時間切れ');
  expect(HostWorker.instances[0].terminate).toHaveBeenCalledOnce();
  const next = search.search(data(), favorite(), time('13:30'), []);
  HostWorker.instances[1].onmessage!({ data: { journeys: [] } });
  expect(await next).toEqual([]);
});
it('Worker起動障害を画面側へ返す', async () => {
  vi.stubGlobal('Worker', HostWorker);
  const search = new JourneySearch();
  const result = search.search(data(), favorite(), time('13:30'), []).catch(e => e.message);
  HostWorker.instances[0].onerror!();
  expect(await result).toContain('アプリを開き直してください');
});
