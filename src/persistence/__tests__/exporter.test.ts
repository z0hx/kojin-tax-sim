import { describe, expect, it } from 'vitest';
import { buildFileName } from '../exporter';

describe('buildFileName', () => {
  it('非暗号化の場合は.json拡張子', () => {
    expect(buildFileName('all', false, new Date(2026, 10, 15))).toBe('taxsim-all-20261115.json');
  });
  it('暗号化の場合は.taxsim.enc拡張子', () => {
    expect(buildFileName('本人', true, new Date(2026, 0, 5))).toBe('taxsim-本人-20260105.taxsim.enc');
  });
});
