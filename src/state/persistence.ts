import { gzipSync, gunzipSync, strToU8, strFromU8 } from 'fflate';
import type { EvenAppBridge } from '@evenrealities/even_hub_sdk';
export interface StoragePort { get(key: string): Promise<string | null>; set(key: string, value: string): Promise<void> }
export class BrowserStorage implements StoragePort {
  async get(key: string): Promise<string | null> { return localStorage.getItem(key); }
  async set(key: string, value: string): Promise<void> { localStorage.setItem(key, value); }
}
export class NativeStorage implements StoragePort {
  constructor(private bridge: EvenAppBridge) {}
  async get(key: string): Promise<string | null> { return (await this.bridge.getLocalStorage(key)) || null; }
  async set(key: string, value: string): Promise<void> {
    if (!await this.bridge.setLocalStorage(key, value)) throw new Error('Evenアプリへの保存が拒否されました');
  }
}
export async function openCache(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('transit-hud-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('cache');
    request.onerror = () => reject(request.error ?? new Error('IndexedDBが使用できません'));
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () => reject(new Error('別画面がキャッシュを使用しています'));
  });
}
export class CacheStorage implements StoragePort {
  constructor(private database: IDBDatabase) {}
  async get(key: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const request = this.database.transaction('cache').objectStore('cache').get(key);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error);
    });
  }
  async set(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tx = this.database.transaction('cache', 'readwrite');
      tx.objectStore('cache').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error('キャッシュ保存失敗'));
      tx.onerror = () => reject(tx.error);
    });
  }
}
/** Host fallback for WebViews without IndexedDB. Write the index last. */
export class ChunkStorage implements StoragePort {
  constructor(private port: StoragePort) {}
  async get(key: string): Promise<string | null> {
    const raw = await this.port.get(`${key}.index`);
    if (!raw) return null;
    const index = JSON.parse(raw) as { id: string; count: number };
    if (!Number.isInteger(index.count) || index.count < 0 || index.count > 160 || !/^[\w-]+$/.test(index.id)) throw new Error('保存キャッシュが破損しています');
    const chunks = [];
    for (let i = 0; i < index.count; i++) {
      const chunk = await this.port.get(`${key}.${index.id}.${i}`);
      if (chunk === null) throw new Error('保存キャッシュの一部がありません');
      chunks.push(chunk);
    }
    return chunks.join('');
  }
  async set(key: string, value: string): Promise<void> {
    if (value.length > 4_000_000) throw new Error('SDK保存の上限4MBを超えています。小規模なGTFSを使用してください');
    const previous = await this.port.get(`${key}.index`);
    const id = crypto.randomUUID(), count = Math.ceil(value.length / 25_000);
    for (let i = 0; i < count; i++) await this.port.set(`${key}.${id}.${i}`, value.slice(i * 25_000, (i + 1) * 25_000));
    await this.port.set(`${key}.index`, JSON.stringify({ id, count }));
    if (previous) {
      try {
        const old = JSON.parse(previous) as { id: string; count: number };
        if (Number.isInteger(old.count) && old.count >= 0 && old.count <= 160 && /^[\w-]+$/.test(old.id)) {
          for (let i = 0; i < old.count; i++) await this.port.set(`${key}.${old.id}.${i}`, '');
        }
      } catch { /* A committed new generation remains readable if old cleanup fails. */ }
    }
  }
}

/** Compress the parsed timetable before the SDK's bounded chunk storage. */
export class CompressedStorage implements StoragePort {
  constructor(private port: StoragePort) {}
  async get(key: string): Promise<string | null> {
    const raw = await this.port.get(key);
    if (!raw || !raw.startsWith('gzip:')) return raw;
    const bytes = Uint8Array.from(atob(raw.slice(5)), c => c.charCodeAt(0));
    return strFromU8(gunzipSync(bytes));
  }
  async set(key: string, value: string): Promise<void> {
    const bytes = gzipSync(strToU8(value));
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    await this.port.set(key, 'gzip:' + btoa(binary));
  }
}
/** Native storage survives WebView cache replacement; migrate legacy IDB data. */
export class DurableCache implements StoragePort {
  constructor(private native: StoragePort, private browser?: StoragePort) {}
  async get(key: string): Promise<string | null> {
    const saved = await this.native.get(key);
    if (saved !== null) return saved;
    const legacy = await this.browser?.get(key) ?? null;
    if (legacy !== null) await this.native.set(key, legacy);
    return legacy;
  }
  async set(key: string, value: string): Promise<void> {
    await this.native.set(key, value);
    try { await this.browser?.set(key, value); } catch { /* Native commit is durable. */ }
  }
}
