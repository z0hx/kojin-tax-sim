import { describe, expect, it, vi } from 'vitest';
import { daysSince, formatDateJa } from '../dateUtils';

describe('formatDateJa', () => {
  it('ISO日時をYYYY-MM-DD形式に変換する', () => {
    expect(formatDateJa('2026-07-05T12:00:00.000Z')).toMatch(/^2026-07-0[45]$/);
  });
});

describe('daysSince(Issue #5/#9で共有: FR-28バックアップ督促判定)', () => {
  it('経過日数を整数で返す', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-27T00:00:00.000Z'));
    expect(daysSince('2026-07-20T00:00:00.000Z')).toBe(7);
    vi.useRealTimers();
  });
});
