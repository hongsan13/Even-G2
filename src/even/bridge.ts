import { waitForEvenAppBridge, type EvenAppBridge } from '@evenrealities/even_hub_sdk';
export async function connectBridge(): Promise<EvenAppBridge | null> {
  const nativeWindow = window as Window & { flutter_inappwebview?: { callHandler?: unknown } };
  if (!nativeWindow.flutter_inappwebview?.callHandler) {
    await new Promise<void>(resolve => {
      const done = () => { window.removeEventListener('flutterInAppWebViewPlatformReady', ready); resolve(); };
      const ready = () => { clearTimeout(timeout); done(); };
      const timeout = setTimeout(done, 2500);
      window.addEventListener('flutterInAppWebViewPlatformReady', ready, { once: true });
    });
  }
  if (!nativeWindow.flutter_inappwebview?.callHandler) return null;
  return waitForEvenAppBridge();
}
