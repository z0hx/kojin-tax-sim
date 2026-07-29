import type { MunicipalityConfig, YearProfile } from '../domain/types';

/** 現行スキーマのバージョン(02仕様書§2.1)。保存データ・エクスポートJSONの`schemaVersion`はこの値になる */
export const CURRENT_SCHEMA_VERSION = 1;

/** 人物(世帯メンバー)。02仕様書§2.1 */
export interface Person {
  id: string;
  displayName: string;
  color: string;
  createdAt: string;
  updatedAt: string;
  years: Record<number, YearProfile>;
  defaults: {
    municipality: MunicipalityConfig;
    safetyRatio: number;
  };
}

/**
 * アプリ全体の設定。人物・年度に依存しない値のみを持つ。
 *
 * かつて theme / furusatoCapMode / onboardingCompleted / taxParamsVerifiedAt を持っていたが、
 * いずれも読み手が存在しないまま残っていたため削除した(#41)。
 * - theme: 配色は ui/theme.css の prefers-color-scheme のみで決まる
 * - furusatoCapMode: 計算明細画面が standard/conservative を常に併記するため設定値を読む箇所がない
 * - onboardingCompleted: 画面分岐は persons.length === 0 で判定している
 * - taxParamsVerifiedAt: 年分ごとの最終確認日は税制パラメータJSONの meta.verifiedAt が正
 */
export interface AppSettings {
  lastExportedAt: string | null;
}

/** IndexedDBに保存されるルート。エクスポートJSONもこの形(02仕様書§2.1) */
export interface AppData {
  schemaVersion: number;
  exportedAt?: string;
  appVersion?: string;
  persons: Person[];
  activePersonId: string | null;
  appSettings: AppSettings;
}

export function defaultAppSettings(): AppSettings {
  return {
    lastExportedAt: null,
  };
}

export function emptyAppData(): AppData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    persons: [],
    activePersonId: null,
    appSettings: defaultAppSettings(),
  };
}
