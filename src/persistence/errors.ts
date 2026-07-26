/** 03詳細設計書§8: 永続化・インポート/エクスポート層の例外 */

export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export class CryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CryptoError';
  }
}

export class StorageError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'StorageError';
  }
}
