/** 03詳細設計書§5.7: localStorageにはUI状態のみを保存する。所得情報は一切保存しない */

const STORAGE_KEY = 'taxsim.uiSettings';

/** 配色は ui/theme.css の prefers-color-scheme のみで決まるため、themeは持たない(#41) */
export interface UiSettings {
  lastActivePersonId: string | null;
  lastActiveYear: number | null;
}

const DEFAULT_UI_SETTINGS: UiSettings = {
  lastActivePersonId: null,
  lastActiveYear: null,
};

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

export function loadUiSettings(): UiSettings {
  if (!hasLocalStorage()) return { ...DEFAULT_UI_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_SETTINGS };
    return { ...DEFAULT_UI_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_UI_SETTINGS };
  }
}

export function saveUiSettings(settings: UiSettings): void {
  if (!hasLocalStorage()) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}
