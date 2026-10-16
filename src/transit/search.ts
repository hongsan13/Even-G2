import { onlineJourneys } from './online';
import { TRANSIT_SERVICE_URL } from '../config';
import type { FavoriteRoute, Journey, RealtimeUpdate, Timetable } from './types';
/** A fresh worker cancels obsolete searches and keeps the WebView interactive. */
export class JourneySearch {
  private worker?: Worker;
  private controller?: AbortController;
  private reject?: (error: Error) => void;
  private timer?: ReturnType<typeof setTimeout>;
  cancel(): void {
    this.controller?.abort(); this.controller = undefined;
    this.worker?.terminate(); this.worker = undefined;
    clearTimeout(this.timer); this.reject?.(new Error('検索を更新しました')); this.reject = undefined;
  }
  search(data: Timetable, favorite: FavoriteRoute, now: number, updates: RealtimeUpdate[], lookbackMinutes = 0): Promise<Journey[]> {
    this.cancel();
    if (data.serverManaged) {
      if (!TRANSIT_SERVICE_URL) return Promise.reject(new Error('このビルドにはオンライン接続先が設定されていません'));
      const controller = new AbortController(); this.controller = controller;
      const timeout = setTimeout(() => controller.abort(), 25000);
      return onlineJourneys(TRANSIT_SERVICE_URL, data, favorite, controller.signal).finally(() => { clearTimeout(timeout); if (this.controller === controller) this.controller = undefined; });
    }
    return new Promise((resolve, reject) => {
      this.reject = reject;
      try {
        const worker = new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' });
        this.worker = worker;
        const finish = () => { clearTimeout(this.timer); worker.terminate(); this.worker = undefined; this.reject = undefined; };
        worker.onmessage = ({ data: result }) => { finish(); result.error ? reject(new Error(result.error)) : resolve(result.journeys); };
        worker.onerror = () => { finish(); reject(new Error('経路検索を開始できません。アプリを開き直してください')); };
        this.timer = setTimeout(() => { finish(); reject(new Error('経路検索が時間切れになりました。路線や方面を絞って再登録してください')); }, 30_000);
        worker.postMessage({ id: 1, data, favorite, now, updates, lookbackMinutes });
      } catch (error) { this.cancel(); reject(error); }
    });
  }
}
