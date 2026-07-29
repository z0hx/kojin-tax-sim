import type { FurusatoCapMode, MunicipalityConfig, YearProfile } from '../domain/types';

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

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  furusatoCapMode: FurusatoCapMode;
  lastExportedAt: string | null;
  onboardingCompleted: boolean;
  taxParamsVerifiedAt: Record<number, string>;
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
    theme: 'system',
    furusatoCapMode: 'standard',
    lastExportedAt: null,
    onboardingCompleted: false,
    taxParamsVerifiedAt: {},
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
