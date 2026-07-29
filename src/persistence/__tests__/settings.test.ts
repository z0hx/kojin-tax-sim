import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadUiSettings, saveUiSettings } from '../settings';

/** NodeにはlocalStorageがないため、テスト用の最小限のインメモリ実装を注入する */
function installMemoryLocalStorage() {
  const store = new Map<string, string>();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('settings (localStorageにはUI状態のみ保存)', () => {
  beforeEach(() => {
    installMemoryLocalStorage();
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).localStorage;
  });

  it('未保存時は既定値を返す', () => {
    expect(loadUiSettings()).toEqual({ lastActivePersonId: null, lastActiveYear: null });
  });

  it('保存した値を読み込める', () => {
    saveUiSettings({ lastActivePersonId: 'p1', lastActiveYear: 2026 });
    expect(loadUiSettings()).toEqual({ lastActivePersonId: 'p1', lastActiveYear: 2026 });
  });

  it('localStorageが存在しない環境では既定値を返し、例外を投げない', () => {
    delete (globalThis as Record<string, unknown>).localStorage;
    expect(() => loadUiSettings()).not.toThrow();
    expect(() => saveUiSettings({ lastActivePersonId: null, lastActiveYear: null })).not.toThrow();
  });
});
