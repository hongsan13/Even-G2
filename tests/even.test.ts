import { describe, it, expect, vi } from 'vitest';
import { OsEventTypeList, validateEvenHubPageContainer, type EvenAppBridge } from '@evenrealities/even_hub_sdk';
import { inputAction } from '../src/even/inputs';
import { menuItems } from '../src/even/menu';
import { G2Renderer, hudModel } from '../src/even/renderer';
import { findJourneys } from '../src/transit/routing';
import { selectNextDepartures } from '../src/transit/departureSelector';
import { data, favorite, time, trip } from './fixtures';
describe('公式SDK入力とメニュー', () => {
  it('protobufで省略されたCLICK=0をenvelope内でだけ補う', () => {
    expect(inputAction({ sysEvent: { eventSource: 1 } } as Parameters<typeof inputAction>[0])).toEqual({ kind: 'next' });
    expect(inputAction({})).toBeNull();
    expect(inputAction({ audioEvent: {} } as Parameters<typeof inputAction>[0])).toBeNull();
  });
  it('scroll、double click、長押し、foregroundを区別', () => {
    expect(inputAction({ textEvent: { eventType: OsEventTypeList.SCROLL_TOP_EVENT } } as Parameters<typeof inputAction>[0])).toEqual({ kind: 'previous' });
    expect(inputAction({ sysEvent: { eventType: OsEventTypeList.DOUBLE_CLICK_EVENT } } as Parameters<typeof inputAction>[0])).toEqual({ kind: 'exit' });
    expect(inputAction({ sysEvent: { eventType: OsEventTypeList.LONG_PRESS_EVENT } } as Parameters<typeof inputAction>[0])).toBeNull();
    expect(inputAction({ sysEvent: { eventType: OsEventTypeList.FOREGROUND_ENTER_EVENT } } as Parameters<typeof inputAction>[0])).toEqual({ kind: 'foreground' });
  });
  it('Contextual Menuは10項目・32UTF8 bytes・unique IDの制限内', () => {
    const menu = menuItems(Array.from({ length: 9 }, (_, i) => favorite({ id: String(i), name: '日本語の長い名前'.repeat(5) })));
    expect(menu).toHaveLength(10); expect(new Set(menu.map(m => m.itemID)).size).toBe(10);
    expect(menu.every(m => new TextEncoder().encode(m.itemName).length <= 32)).toBe(true);
  });
});
describe('HUD / 公式SDK page validation', () => {
  it('徒歩で間に合う便を推奨した時、下段はその後の2本を表示する', () => {
    const timetable = data(['13:44', '13:48', '13:52', '13:58', '14:04'].map((t, i) => trip(String(i), [['A', t], ['B', '14:30']])));
    const now = time('13:43'), f = favorite();
    const departures = selectNextDepartures(findJourneys(timetable, f, now), now, 7, 2);
    const model = hudModel(timetable, f, departures, null, now, '');
    expect(model.primary).toContain('13:52'); expect(model.alternatives).toContain('13:58'); expect(model.alternatives).toContain('14:04');
    expect(model.alternatives).not.toContain('13:44'); expect(model.alternatives).not.toContain('13:48');
  });
  function bridgeMock() {
    return { createStartUpPageContainer: vi.fn().mockResolvedValue(0), rebuildPageContainer: vi.fn().mockResolvedValue(true), textContainerUpgrade: vi.fn().mockResolvedValue(true) };
  }
  it('3本、徒歩判定、到着を表示し、変更がない時はSDKに再送しない', async () => {
    const native = bridgeMock(), renderer = new G2Renderer(native as unknown as EvenAppBridge);
    const timetable = data(), f = favorite(), now = time('13:43');
    const departures = selectNextDepartures(findJourneys(timetable, f, now), now, 7, 2);
    const model = hudModel(timetable, f, departures, null, now, '予定時刻');
    expect(model.primary).toContain('13:52'); expect(model.alternatives).toContain('13:58'); expect(model.alternatives).toContain('14:04'); expect(model.footer).toContain('14:13');
    await renderer.render(model, [f]); await renderer.render(model, [f]);
    expect(native.createStartUpPageContainer).toHaveBeenCalledOnce(); expect(native.textContainerUpgrade).not.toHaveBeenCalled();
    const props = native.createStartUpPageContainer.mock.calls[0][0];
    expect(validateEvenHubPageContainer(props).valid).toBe(true);
    expect(props.textObject.filter((p: { isEventCapture: number }) => p.isEventCapture === 1)).toHaveLength(1);
    await renderer.render({ ...model, primary: '13:52発 · あと8分' }, [f]); expect(native.textContainerUpgrade).toHaveBeenCalledOnce();
  });
  it('起動失敗を成功と扱わず、次の描画で再試行', async () => {
    const native = bridgeMock(); native.createStartUpPageContainer.mockResolvedValueOnce(1);
    const renderer = new G2Renderer(native as unknown as EvenAppBridge), model = hudModel(null, undefined, [], null, 0, '');
    await expect(renderer.render(model, [])).rejects.toThrow('作成'); await renderer.render(model, []);
    expect(native.createStartUpPageContainer).toHaveBeenCalledTimes(2);
  });
  it('background中は通信せず、foregroundで必要な差分だけ反映', async () => {
    const native = bridgeMock(), renderer = new G2Renderer(native as unknown as EvenAppBridge);
    const model = hudModel(null, undefined, [], null, 0, ''); await renderer.render(model, []); renderer.pause();
    await renderer.render({ ...model, action: 'new' }, []); expect(native.textContainerUpgrade).not.toHaveBeenCalled();
    renderer.resume(); await renderer.render({ ...model, action: 'new' }, []); expect(native.textContainerUpgrade).toHaveBeenCalledOnce();
  });
});
