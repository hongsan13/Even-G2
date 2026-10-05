import type { FavoriteRoute, Journey, RealtimeUpdate, Timetable } from './types';
/** A fresh worker cancels obsolete searches and keeps the WebView interactive. */
export class JourneySearch {
  private worker?: Worker;
  private reject?: (error: Error) => void;
  private timer?: ReturnType<typeof setTimeout>;
  cancel(): void {
    this.worker?.terminate(); this.worker = undefined;
    clearTimeout(this.timer); this.reject?.(new Error('検索を更新しました')); this.reject = undefined;
  }
  search(data: Timetable, favorite: FavoriteRoute, now: number, updates: RealtimeUpdate[]): Promise<Journey[]> {
    this.cancel();
    return new Promise((resolve, reject) => {
      this.reject = reject;
      try {
        const worker = new Worker(new URL('./searchWorker.ts', import.meta.url), { type: 'module' });
        this.worker = worker;
        const finish = () => { clearTimeout(this.timer); worker.terminate(); this.worker = undefined; this.reject = undefined; };
        worker.onmessage = ({ data: result }) => { finish(); result.error ? reject(new Error(result.error)) : resolve(result.journeys); };
        worker.onerror = () => { finish(); reject(new Error('経路検索を開始できません。アプリを開き直してください')); };
        this.timer = setTimeout(() => { finish(); reject(new Error('経路検索が時間切れになりました。路線や方面を絞って再登録してください')); }, 30_000);
        worker.postMessage({ id: 1, data, favorite, now, updates });
      } catch (error) { this.cancel(); reject(error); }
    });
  }
}
