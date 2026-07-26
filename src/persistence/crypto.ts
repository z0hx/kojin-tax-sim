import { CryptoError } from './errors';

/** 03詳細設計書§5.6: ファイル形式 MAGIC(8) | version(1) | salt(16) | iv(12) | ciphertext */
export const MAGIC = new TextEncoder().encode('TAXSIMv1');
const FORMAT_VERSION = 1;
const PBKDF2_ITERATIONS = 310_000;
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/**
 * TypeScript 5.5+ の lib.dom.d.ts は BufferSource として `Uint8Array<ArrayBuffer>` を要求するが、
 * `Uint8Array.prototype.slice` 等は `Uint8Array<ArrayBufferLike>` を返すため型が合わない。
 * 実行時には問題がないため、Web Crypto API呼び出しの境界でのみ型を合わせる。
 */
function toBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}

export function looksEncrypted(bytes: Uint8Array): boolean {
  if (bytes.length < MAGIC.length) return false;
  return MAGIC.every((b, i) => bytes[i] === b);
}

async function deriveKey(passphrase: string, salt: Uint8Array, usage: KeyUsage): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: toBufferSource(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

export async function encrypt(plain: string, passphrase: string): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  const key = await deriveKey(passphrase, salt, 'encrypt');
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv: toBufferSource(iv) }, key, toBufferSource(new TextEncoder().encode(plain)))
  );
  return concatBytes(MAGIC, new Uint8Array([FORMAT_VERSION]), salt, iv, cipher);
}

export async function decrypt(bytes: Uint8Array, passphrase: string): Promise<string> {
  if (!looksEncrypted(bytes)) {
    throw new CryptoError('ファイル形式が不正です(暗号化ファイルではありません)');
  }
  let offset = MAGIC.length;
  const version = bytes[offset];
  offset += 1;
  if (version !== FORMAT_VERSION) {
    throw new CryptoError(`未対応の暗号化バージョンです: ${version}`);
  }
  const salt = bytes.slice(offset, offset + SALT_LENGTH);
  offset += SALT_LENGTH;
  const iv = bytes.slice(offset, offset + IV_LENGTH);
  offset += IV_LENGTH;
  const cipher = bytes.slice(offset);

  const key = await deriveKey(passphrase, salt, 'decrypt');
  try {
    const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: toBufferSource(iv) }, key, toBufferSource(cipher));
    return new TextDecoder().decode(plainBuf);
  } catch {
    throw new CryptoError('復号に失敗しました。パスフレーズが誤っているか、ファイルが破損しています。');
  }
}
