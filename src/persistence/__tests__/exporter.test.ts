import { describe, expect, it } from 'vitest';
import { buildFileName, sanitizeFilenamePart } from '../exporter';

describe('buildFileName', () => {
  it('非暗号化の場合は.json拡張子', () => {
    expect(buildFileName('all', false, new Date(2026, 10, 15))).toBe('taxsim-all-20261115.json');
  });
  it('暗号化の場合は.taxsim.enc拡張子', () => {
    expect(buildFileName('本人', true, new Date(2026, 0, 5))).toBe('taxsim-本人-20260105.taxsim.enc');
  });
});

describe('sanitizeFilenamePart', () => {
  it('パス区切り文字やOS予約文字を除去する', () => {
    expect(sanitizeFilenamePart('本人/配偶者:テスト?')).toBe('本人_配偶者_テスト_');
  });
  it('前後の空白を除去する', () => {
    expect(sanitizeFilenamePart('  本人  ')).toBe('本人');
  });
  it('前後の空白のみの場合はnullを返す', () => {
    expect(sanitizeFilenamePart('   ')).toBeNull();
  });
});
