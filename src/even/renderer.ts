import { CreateStartUpPageContainer, RebuildPageContainer, TextContainerProperty, TextContainerUpgrade, StartUpPageCreateResult, MenuContainerProperty, MenuItemProperty,
  type EvenAppBridge } from '@evenrealities/even_hub_sdk';
import type { Departure, FavoriteRoute, Timetable } from '../transit/types';
import { clock, MINUTE } from '../utils/time';
import { recommendedDeparture } from '../transit/departureSelector';
import { menuItems } from './menu';
export interface HudModel { title: string; action: string; primary: string; detail: string; alternatives: string; footer: string }
const label = { SAFE: '◎ 今出れば間に合う', LEAVE_NOW: '→ 出発推奨', TIGHT: '！今すぐ出発', MISSED: '× 間に合わない' };
export function hudModel(data: Timetable | null, favorite: FavoriteRoute | undefined, departures: Departure[], selectedId: string | null, now: number,
  note: string, journey?: Departure): HudModel {
  const name = (id: string) => data?.stations.find(s => s.id === id)?.name ?? id;
  const title = favorite ? `${name(favorite.from)} → ${name(favorite.to)}` : 'Transit HUD';
  const footer = data?.demo ? '架空サンプル · 乗車案内には使えません' : note;
  if (!data || !favorite) return { title, action: 'スマホで初期設定', primary: '時刻表を取り込んでください', detail: 'GTFS ZIP → ルート登録', alternatives: '', footer };
  if (journey) {
    const legs = journey.journey.legs;
    const current = legs.find(l => now < l.arrival);
    if (!current) return { title, action: '到着予定時刻を過ぎました', primary: name(favorite.to), detail: '乗車状況は自動検知しません', alternatives: 'スマホで乗車モードを終了', footer };
    const i = legs.indexOf(current);
    const lineName = data.lines.find(l => l.id === current.routeId)?.name ?? current.routeId;
    return { title, action: now < current.departure ? '次の行動 · 乗車' : `次は${name(current.to)}${i + 1 < legs.length ? 'で乗換' : 'で降車'}`,
      primary: `${clock(now < current.departure ? current.departure : current.arrival)} · あと${Math.max(0, Math.ceil(((now < current.departure ? current.departure : current.arrival) - now) / MINUTE))}分`,
      detail: `${lineName} ${current.platform ? `${current.platform}番線` : ''}${current.arrivalEstimated ? ' · 到着目安' : ''}`,
      alternatives: i + 1 < legs.length ? `次 ${clock(legs[i + 1].departure)} ${data.lines.find(l => l.id === legs[i + 1].routeId)?.name ?? ''}` : `${name(current.to)}で降車`, footer };
  }
  const selected = departures.find(d => d.journey.id === selectedId) ?? recommendedDeparture(departures);
  if (!selected) return { title, action: '対象の便がありません', primary: '運行日・経路を確認', detail: '検索範囲は翌日まで', alternatives: '', footer };
  const first = selected.journey.legs[0];
  const line = data.lines.find(l => l.id === first.routeId)?.name ?? first.routeId;
  const others = departures.slice(departures.indexOf(selected) + 1, departures.indexOf(selected) + 3);
  return { title, action: label[selected.status], primary: `${clock(first.departure)}発 · あと${selected.minutesUntilDeparture}分`,
    detail: `${line}${first.delaySeconds ? ` (${Math.round(first.delaySeconds / 60)}分補正)` : ''} ${first.platform ? `${first.platform}番線 ` : ''}${first.headsign}`,
    alternatives: others.map(d => `${d.reachable ? '○' : '×'} ${clock(d.departureTime)} あと${d.minutesUntilDeparture}分`).join('  '),
    footer: `${name(favorite.to)} ${clock(selected.journey.arrival)}${selected.journey.legs.at(-1)?.arrivalEstimated ? '着目安' : '着'} · 乗換${selected.journey.transfers}回\n${footer}` };
}
const geometry = [
  { y: 4, height: 34 }, { y: 42, height: 34 }, { y: 80, height: 36 },
  { y: 120, height: 42 }, { y: 168, height: 40 }, { y: 214, height: 68 },
];
export class G2Renderer {
  private initialized = false;
  private previous: string[] = [];
  private previousMenu = '';
  private queue: Promise<void> = Promise.resolve();
  private enabled = true;
  constructor(private bridge: EvenAppBridge) {}
  pause(): void { this.enabled = false; }
  resume(): void { this.enabled = true; }
  render(model: HudModel, favorites: FavoriteRoute[]): Promise<void> {
    this.queue = this.queue.catch(() => {}).then(async () => {
      if (!this.enabled) return;
      // Conservative line widths; actual Japanese font metrics still require G2 testing.
      const fit = (text: string, columns: number) => {
        let out = '', width = 0;
        for (const c of text) {
          const units = /[\u0000-\u007f]/.test(c) ? 1 : 2;
          if (width + units > columns - 2) return out + '…';
          out += c; width += units;
        }
        return out;
      };
      const contents = [model.title, model.action, model.primary, model.detail, model.alternatives, model.footer]
        .map(t => t.split('\n').slice(0, 2).map(line => fit(line, 48)).join('\n'));
      const menu = menuItems(favorites), menuKey = JSON.stringify(menu);
      if (!this.initialized || menuKey !== this.previousMenu) {
        const props = { containerTotalNum: 6, textObject: contents.map((content, i) => new TextContainerProperty({
          xPosition: 8, yPosition: geometry[i].y, width: 560, height: geometry[i].height,
          paddingLength: 0, containerID: i + 1, containerName: `hud-${i}`, content, isEventCapture: i === 2 ? 1 : 0,
        })), menuObject: new MenuContainerProperty({ menuItems: menu.map(item => new MenuItemProperty(item)) }) };
        const success = this.initialized ? await this.bridge.rebuildPageContainer(new RebuildPageContainer(props))
          : await this.bridge.createStartUpPageContainer(new CreateStartUpPageContainer(props)) === StartUpPageCreateResult.success;
        if (!success) throw new Error('G2画面の作成に失敗しました。接続・Evenアプリの版を確認してください');
        this.initialized = true; this.previousMenu = menuKey; this.previous = contents;
      } else for (let i = 0; i < contents.length; i++) if (contents[i] !== this.previous[i]) {
        if (!await this.bridge.textContainerUpgrade(new TextContainerUpgrade({ containerID: i + 1, containerName: `hud-${i}`, content: contents[i] }))) throw new Error('G2への表示更新が失敗しました');
        this.previous[i] = contents[i];
      }
    });
    return this.queue;
  }
}
