import { vi } from 'vitest';
import params2025 from '../../../public/taxParams/2025.json';
import params2026 from '../../../public/taxParams/2026.json';
import type { MunicipalityConfig } from '../../domain/types';

const PARAMS_BY_YEAR: Record<number, unknown> = { 2025: params2025, 2026: params2026 };

/** Nodeにはlocalstorageがないため、テスト用の最小限のインメモリ実装を注入する(settings.test.tsと同じ手法) */
export function installMemoryLocalStorage(): void {
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

export function uninstallMemoryLocalStorage(): void {
  delete (globalThis as Record<string, unknown>).localStorage;
}

/** public/taxParams/{year}.json 相当を返すfetchスタブ。未知の年はHTTP 404を返す */
export function stubFetchForTaxParams(overrides: Record<number, 'fail'> = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = typeof input === 'string' ? input : String(input);
      const match = /taxParams\/(\d+)\.json$/.exec(url);
      const year = match ? Number(match[1]) : NaN;
      if (overrides[year] === 'fail' || !PARAMS_BY_YEAR[year]) {
        return new Response(null, { status: 404 });
      }
      return new Response(JSON.stringify(PARAMS_BY_YEAR[year]), { status: 200 });
    })
  );
}

/**
 * navigator.storageのみを差し替える(jsdom環境ではnavigator自体を丸ごとvi.stubGlobalすると
 * userEvent等が参照する他プロパティが失われるため、useAppStore.test.tsのnavigator全体スタブとは
 * 別の手法を使う)。
 */
export function installStoragePersistMock(persistResult = true): { persist: ReturnType<typeof vi.fn> } {
  const persist = vi.fn(async () => persistResult);
  const persisted = vi.fn(async () => false);
  const estimate = vi.fn(async () => ({ usage: 0, quota: 0 }));
  Object.defineProperty(window.navigator, 'storage', {
    value: { persist, persisted, estimate },
    configurable: true,
  });
  return { persist };
}

export function uninstallStoragePersistMock(): void {
  Reflect.deleteProperty(window.navigator, 'storage');
}

export function yokohamaMunicipality(): MunicipalityConfig {
  return {
    name: '横浜市',
    prefectureName: '神奈川県',
    municipalIncomeRate: 0.06,
    prefecturalIncomeRate: 0.04025,
    municipalPerCapita: 3900,
    prefecturalPerCapita: 1000,
    forestTax: 1000,
    useStandardRateForFurusato: true,
  };
}
