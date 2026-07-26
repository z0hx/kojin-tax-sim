import { decrypt, looksEncrypted } from './crypto';
import { ImportError } from './errors';
import { migrate } from './migration';
import type { AppData, Person } from './types';

export type ImportMode = 'replace' | 'merge' | 'addAsNew';

export interface ParsedImport {
  data: AppData;
  originalSchemaVersion: number;
}

export async function parseImportFile(file: Blob, passphrase?: string): Promise<ParsedImport> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let json: string;
  if (looksEncrypted(bytes)) {
    if (!passphrase) {
      throw new ImportError('このファイルは暗号化されています。パスフレーズを入力してください。');
    }
    json = await decrypt(bytes, passphrase);
  } else {
    json = new TextDecoder().decode(bytes);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new ImportError(`ファイルの形式が不正です(JSONとして解釈できません): ${(e as Error).message}`);
  }

  const originalSchemaVersion =
    typeof parsed === 'object' && parsed !== null && typeof (parsed as Record<string, unknown>).schemaVersion === 'number'
      ? ((parsed as Record<string, unknown>).schemaVersion as number)
      : NaN;

  const data = migrate(parsed);
  return { data, originalSchemaVersion };
}

export interface ImportPreviewEntry {
  id: string;
  displayName: string;
  changedYears?: number[];
}

export interface ImportPreview {
  fileName: string;
  exportedAt: string | null;
  schemaVersion: number;
  migrationApplied: boolean;
  added: ImportPreviewEntry[];
  updated: ImportPreviewEntry[];
  removed: ImportPreviewEntry[];
}

export function buildImportPreview(
  current: AppData,
  parsed: ParsedImport,
  mode: ImportMode,
  fileName: string
): ImportPreview {
  const incoming = parsed.data;
  const currentById = new Map(current.persons.map((p) => [p.id, p]));
  const migrationApplied = parsed.originalSchemaVersion !== incoming.schemaVersion;
  const base = {
    fileName,
    exportedAt: incoming.exportedAt ?? null,
    schemaVersion: incoming.schemaVersion,
    migrationApplied,
  };

  if (mode === 'addAsNew') {
    return {
      ...base,
      added: incoming.persons.map((p) => ({ id: p.id, displayName: p.displayName })),
      updated: [],
      removed: [],
    };
  }

  if (mode === 'replace') {
    return {
      ...base,
      added: incoming.persons.filter((p) => !currentById.has(p.id)).map((p) => ({ id: p.id, displayName: p.displayName })),
      updated: incoming.persons
        .filter((p) => currentById.has(p.id))
        .map((p) => ({ id: p.id, displayName: p.displayName, changedYears: Object.keys(p.years).map(Number) })),
      removed: current.persons
        .filter((p) => !incoming.persons.some((ip) => ip.id === p.id))
        .map((p) => ({ id: p.id, displayName: p.displayName })),
    };
  }

  // merge: 同一idはupdatedAtが新しい方を採用。無い人物は追加。
  const added: ImportPreviewEntry[] = [];
  const updated: ImportPreviewEntry[] = [];
  for (const p of incoming.persons) {
    const existing = currentById.get(p.id);
    if (!existing) {
      added.push({ id: p.id, displayName: p.displayName });
    } else if (new Date(p.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      updated.push({ id: p.id, displayName: p.displayName, changedYears: Object.keys(p.years).map(Number) });
    }
  }
  return { ...base, added, updated, removed: [] };
}

/**
 * 全人物に新しいidを採番する。既存人物と表示名が重複する場合は「(インポート)」を付けて
 * 視認性を確保する(03詳細設計書§5.5、Low#8是正)。インポートするファイル内に同名の人物が
 * 複数含まれる場合も、連番を付けて区別する(レビュー2巡目Low#4是正)。
 */
function regenerateIds(persons: Person[], existingDisplayNames: Set<string>): Person[] {
  const usedNames = new Set(existingDisplayNames);
  return persons.map((p) => {
    let displayName = p.displayName;
    if (usedNames.has(displayName)) {
      let candidate = `${p.displayName}(インポート)`;
      let suffix = 2;
      while (usedNames.has(candidate)) {
        candidate = `${p.displayName}(インポート${suffix})`;
        suffix += 1;
      }
      displayName = candidate;
    }
    usedNames.add(displayName);
    return { ...p, id: crypto.randomUUID(), displayName };
  });
}

/** 純粋関数。replace時の自動バックアップダウンロードはUI/store層の責務とする(03詳細設計書§5.5) */
export function applyImport(current: AppData, incoming: AppData, mode: ImportMode): AppData {
  if (mode === 'replace') {
    const activePersonId =
      current.activePersonId && incoming.persons.some((p) => p.id === current.activePersonId)
        ? current.activePersonId
        : (incoming.persons[0]?.id ?? null);
    return { ...incoming, activePersonId };
  }

  if (mode === 'addAsNew') {
    const existingDisplayNames = new Set(current.persons.map((p) => p.displayName));
    return { ...current, persons: [...current.persons, ...regenerateIds(incoming.persons, existingDisplayNames)] };
  }

  // merge
  const currentById = new Map(current.persons.map((p) => [p.id, p]));
  for (const p of incoming.persons) {
    const existing = currentById.get(p.id);
    if (!existing || new Date(p.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
      currentById.set(p.id, p);
    }
  }
  return { ...current, persons: Array.from(currentById.values()) };
}
