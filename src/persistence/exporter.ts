import { encrypt } from './crypto';
import { CURRENT_SCHEMA_VERSION } from './migration';
import { defaultAppSettings, type AppData, type Person } from './types';

export interface ExportOptions {
  personIds: string[] | 'all';
  passphrase?: string;
  includeSettings: boolean;
}

const FORBIDDEN_FILENAME_CHARS = /[\\/:*?"<>|]/g;

/** ファイル名の一部として安全に使えるよう、パス区切り文字やOS予約文字を除去する。空文字になった場合はnullを返す */
export function sanitizeFilenamePart(raw: string): string | null {
  const cleaned = raw.trim().replace(FORBIDDEN_FILENAME_CHARS, '_').slice(0, 40);
  return cleaned.length > 0 ? cleaned : null;
}

export function buildFileName(target: string, encrypted: boolean, date: Date = new Date()): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `taxsim-${target}-${yyyy}${mm}${dd}${encrypted ? '.taxsim.enc' : '.json'}`;
}

export function buildExportPayload(root: AppData, opts: ExportOptions): AppData {
  const persons: Person[] = opts.personIds === 'all' ? root.persons : root.persons.filter((p) => opts.personIds.includes(p.id));
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    persons,
    activePersonId: null,
    appSettings: opts.includeSettings ? root.appSettings : defaultAppSettings(),
  };
}

export async function exportData(root: AppData, opts: ExportOptions): Promise<Blob> {
  const payload = buildExportPayload(root, opts);
  const json = JSON.stringify(payload, null, 2);
  if (opts.passphrase) {
    const cipher = await encrypt(json, opts.passphrase);
    // TS 5.5+の型では Uint8Array<ArrayBufferLike> が BlobPart と厳密には合わないため、実行時に問題のない範囲でキャストする
    return new Blob([cipher as unknown as BlobPart], { type: 'application/octet-stream' });
  }
  return new Blob([json], { type: 'application/json' });
}

/** File System Access API が使える場合はそれを使い、不可ならダウンロードリンクにフォールバックする(ブラウザ専用・手動検証D-06) */
export async function saveBlob(blob: Blob, filename: string): Promise<void> {
  const w = window as unknown as { showSaveFilePicker?: (opts: { suggestedName: string }) => Promise<FileSystemFileHandle> };
  if (typeof w.showSaveFilePicker === 'function') {
    const handle = await w.showSaveFilePicker({ suggestedName: filename });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // 一部ブラウザ(旧WebKit系)ではダウンロード処理が始まる前にBlob URLを失効させると失敗するため、
  // 即座にrevokeせず次のタスクまで遅延させる(Low#9是正)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
