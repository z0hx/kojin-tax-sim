import { openDB, type IDBPDatabase } from 'idb';

export const DB_NAME = 'taxsim';
export const DB_VERSION = 1;
export const STORE_NAME = 'appData';
export const ROOT_KEY = 'root';

let dbPromise: Promise<IDBPDatabase> | null = null;

/**
 * 03詳細設計書§5.1: object store `appData` (out-of-line key) を1つだけ持つ。
 * IndexedDBの構造(store/index構成)を変えない限り、DB_VERSIONは1のまま据え置く。
 * AppData.schemaVersionとは別概念であることに注意。
 */
export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
  }
  return dbPromise;
}

/** テスト専用: モジュールスコープのDB接続キャッシュをリセットする */
export function resetDbConnectionForTests(): void {
  dbPromise = null;
}
