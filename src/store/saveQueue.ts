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

/**
 * ストア側が`isSaving`をstateに反映するためのリスナーを1つだけ登録する。
 * saveQueueはモジュール単位のシングルトンであり、リスナーも1つしか保持できない。
 * `createAppStore()`を複数回呼ぶ(テスト等)と、後から生成したストアのリスナーが前のものを上書きする。
 * 本番では`useAppStore`インスタンスが1つしか存在しないため問題にならないが、複数ストアを同時に
 * 使う場合はこの前提が崩れる点に注意。
 */
export function setSavingListener(cb: ((saving: boolean) => void) | undefined): void {
  onSavingChange = cb;
}

/**
 * 500msデバウンス。連続呼び出しではタイマーを再設定する。
 * lockedの間は何もしない(lastScheduledDataの更新も含めて完全にスキップする)。withLockのコールバックが
 * recordSaved()でlastScheduledDataを確定させた後、ロック中に発行された無関係なschedule()がそれを
 * 上書きしてしまう残存レースを防ぐ(レビューで指摘: 破壊的操作の実行中は永続化を一切試みない設計とする)。
 */
export function schedule(data: AppData): void {
  if (locked) return;
  lastScheduledData = data;
  if (timer) clearTimeout(timer);
  timer = null;
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
 *
 * lockedの間(deleteAllData/commitImport実行中)は新規保存を試みない。lastScheduledDataは
 * ロック開始前の(まもなく無効になる)古いデータを指している可能性があり、それを保存すると
 * 削除/インポート直後にデータが復活しかねない(withLockのrun()より後にこのrunが直列化されるため)。
 * ロック中に呼ばれた場合は、現在直列化チェーンで進行中の処理の完了のみを待つ。
 */
export async function flushNow(): Promise<void> {
  cancelPendingTimer();
  if (locked) {
    await pending;
    return;
  }
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
