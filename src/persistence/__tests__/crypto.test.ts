import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, looksEncrypted } from '../crypto';
import { CryptoError } from '../errors';

describe('encrypt/decrypt (T-22 暗号化ラウンドトリップ)', () => {
  it('正しいパスフレーズで復号できる', async () => {
    const plain = JSON.stringify({ hello: 'world', amount: 12345 });
    const cipher = await encrypt(plain, 'correct-horse-battery-staple');
    const decrypted = await decrypt(cipher, 'correct-horse-battery-staple');
    expect(decrypted).toBe(plain);
  });

  it('誤ったパスフレーズでは例外を投げる', async () => {
    const cipher = await encrypt('secret payload', 'correct-passphrase');
    await expect(decrypt(cipher, 'wrong-passphrase')).rejects.toThrow(CryptoError);
  });

  it('暗号化ファイルはマジックバイトで検出できる', async () => {
    const cipher = await encrypt('x', 'p');
    expect(looksEncrypted(cipher)).toBe(true);
    expect(looksEncrypted(new TextEncoder().encode('{"schemaVersion":1}'))).toBe(false);
  });

  it('暗号化されていないデータをdecryptに渡すと例外を投げる', async () => {
    await expect(decrypt(new TextEncoder().encode('plain json'), 'any')).rejects.toThrow(CryptoError);
  });
});
