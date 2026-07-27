import { saveAppData } from '../persistence/repository';
import type { AppData } from '../persistence/types';

/**
 * 03詳細設計書§4.3・§5、およびレビューで判明した不具合(削除/インポート直後のデータ復活)是正を反映した
 * デバウンス保存の直列化キュー。永続化のタイミング制御のみを責務とし、Zustandストアには依存しない。
 */

export const DEBOUNCE_MS = 500;

let lastScheduledData: AppData | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Promise<void> = Promise.resolve();
let locked = false;
let onSavingChange: ((saving: boolean) => void) | undefined;

/** ストア側が`isSaving`をstateに反映するためのリスナーを1つだけ登録する */
export function setSavingListener(cb: ((saving: boolean) => void) | undefined): void {
  onSavingChange = cb;
}

/** 500msデバウンス。連続呼び出しではタイマーを再設定する。lockedの間はタイマーを設定しない(永続化のみスキップ)。 */
export function schedule(data: AppData): void {
  lastScheduledData = data;
  if (timer) clearTimeout(timer);
  timer = null;
  if (locked) return;
  timer = setTimeout(() => {
    timer = null;
    void run(() => saveAppData(data));
  }, DEBOUNCE_MS);
}

/** 保留中のタイマーを実行せずに破棄する */
export function cancelPendingTimer(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

/**
 * 任意の永続化操作を直列化チェーンに連結して実行する。
 * 呼び出し元へ返すPromiseは`op`の成否をそのまま伝えるが、内部のチェーン(`pending`)はエラーで途切れさせない
 * (1回の失敗が以降の全保存を止めてしまうことを防ぐ)。
 */
export function run(op: () => Promise<void>): Promise<void> {
  const next = pending.then(async () => {
    onSavingChange?.(true);
    try {
      await op();
    } finally {
      onSavingChange?.(false);
    }
  });
  pending = next.catch(() => undefined);
  return next;
}

/**
 * 保留中のタイマーがあれば即座にキャンセルし、最後にscheduleされたdataで直ちに保存を実行して完了を待つ。
 * 保留タイマーが無ければ、現在直列化チェーンで実行中の保存の完了のみを待つ。
 */
export async function flushNow(): Promise<void> {
  cancelPendingTimer();
  if (lastScheduledData) {
    const data = lastScheduledData;
    await run(() => saveAppData(data));
  } else {
    await pending;
  }
}

/**
 * scheduleを介さずrun()で直接保存した場合に、以後のflushNow()が古いデータで上書きしないよう記録する。
 */
export function recordSaved(data: AppData): void {
  lastScheduledData = data;
}

/**
 * 破壊的操作(全データ削除・インポート適用)の実行中、他の操作が発行するschedule()を無力化する。
 * ロック中に発行されたschedule()は永続化タイマーを設定しない(呼び出し元のメモリ上state更新自体は妨げない)。
 */
export async function withLock<T>(op: () => Promise<T>): Promise<T> {
  locked = true;
  try {
    return await op();
  } finally {
    locked = false;
  }
}

/** テスト専用: モジュールスコープの状態を初期化する */
export function resetSaveQueueForTests(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  lastScheduledData = null;
  pending = Promise.resolve();
  locked = false;
  onSavingChange = undefined;
}
