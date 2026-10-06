import { test, expect } from '@playwright/test';
test('SDKスワイプで候補選択、タッチで乗車・固定・解除、候補なしでは乗車しない', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-10-06T13:43:00+09:00'));
  await page.addInitScript(() => {
    const w = window as unknown as { flutter_inappwebview: { callHandler: (name: string, raw: string) => Promise<unknown> } };
    w.flutter_inappwebview = { callHandler: async (_, raw) => {
      const { method, data } = JSON.parse(raw), store = JSON.parse(sessionStorage.getItem('gesture-native') || '{}');
      if (method === 'getLocalStorage') return store[data.key] ?? (data.key === 'transit-hud.auto-update' ? 'false' : data.key === 'transit-hud.initial-data' ? 'disabled' : '');
      if (method === 'setLocalStorage') { store[data.key] = data.value; sessionStorage.setItem('gesture-native', JSON.stringify(store)); }
      return method === 'createStartUpPageContainer' ? 0 : true;
    } };
  });
  await page.goto('/'); await expect(page.locator('#connection')).toHaveText('Even App接続済み');
  const gesture = (eventType: number, kind = 'textEvent') => page.evaluate(({ eventType, kind }) => {
    (window as unknown as { _listenEvenAppMessage: (event: unknown) => void })._listenEvenAppMessage({ method: 'evenHubEvent', data: { type: kind, jsonData: { eventType } } });
  }, { eventType, kind });
  await gesture(0); await expect(page.locator('#status')).toContainText('乗車可能な便を選択');
  await expect(page.locator('[data-action="board"]')).toHaveText('この便に乗車');
  await page.getByRole('button', { name: '架空サンプルを試す' }).click();
  await expect(page.locator('.hud-primary')).toContainText('13:54');
  await gesture(2); await expect(page.locator('.hud-primary')).toContainText('14:00');
  await gesture(1, 'sysEvent'); await expect(page.locator('.hud-primary')).toContainText('13:54');
  await gesture(2, 'sysEvent'); await expect(page.locator('.hud-primary')).toContainText('14:00');
  await gesture(0); await expect(page.locator('[data-action="board"]')).toHaveText('乗車モードを終了');
  const pinned = await page.locator('#hud').textContent();
  await gesture(2); await expect(page.locator('#hud')).toHaveText(pinned!);
  await gesture(0, 'sysEvent'); await expect(page.locator('[data-action="board"]')).toHaveText('この便に乗車');
  await gesture(1); await expect(page.locator('.hud-primary')).toContainText('13:54');
});
