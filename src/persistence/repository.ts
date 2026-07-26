import { getDb, ROOT_KEY, STORE_NAME } from './db';
import { StorageError } from './errors';
import type { AppData } from './types';

/** 03詳細設計書§5.2: repository APIは3本に絞る。粒度の細かいCRUDは呼び出し側(store)が組み立てる */

export async function loadAppData(): Promise<AppData | null> {
  try {
    const db = await getDb();
    const data = await db.get(STORE_NAME, ROOT_KEY);
    return (data as AppData | undefined) ?? null;
  } catch (e) {
    throw new StorageError(`データの読み込みに失敗しました: ${(e as Error).message}`, e);
  }
}

export async function saveAppData(data: AppData): Promise<void> {
  try {
    const db = await getDb();
    await db.put(STORE_NAME, data, ROOT_KEY);
  } catch (e) {
    throw new StorageError(`データの保存に失敗しました: ${(e as Error).message}`, e);
  }
}

export async function clearAppData(): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(STORE_NAME, ROOT_KEY);
  } catch (e) {
    throw new StorageError(`データの削除に失敗しました: ${(e as Error).message}`, e);
  }
}
