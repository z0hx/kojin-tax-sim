import { describe, expect, it, vi } from 'vitest';
import { daysSince, formatDateJa, isDateOnlyPast, parseDateOnly } from '../dateUtils';

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

describe('parseDateOnly / isDateOnlyPast(#44: ワンストップ特例の期限判定)', () => {
  it('日付のみの文字列をローカル日付として解釈する(new Date()のUTC解釈と異なる)', () => {
    const d = parseDateOnly('2027-01-10');
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(10);
    expect(d.getHours()).toBe(0);
  });

  it('期日当日は「過ぎていない」と判定する(必着の締切のため)', () => {
    expect(isDateOnlyPast('2027-01-10', new Date(2027, 0, 10, 23, 59))).toBe(false);
  });

  it('期日の翌日は0時0分の時点で「過ぎている」と判定する', () => {
    expect(isDateOnlyPast('2027-01-10', new Date(2027, 0, 11, 0, 0))).toBe(true);
  });

  it('期日前は「過ぎていない」と判定する', () => {
    expect(isDateOnlyPast('2027-01-10', new Date(2027, 0, 9, 23, 59))).toBe(false);
  });

  it('daysSinceに日付のみを渡した場合のUTCずれが解消されている', () => {
    // JST(UTC+9)では、翌日の0時はUTCではまだ期日当日15時。daysSinceだと0のままで警告が出ない
    const jan11Jst = new Date(2027, 0, 11, 0, 0);
    expect(isDateOnlyPast('2027-01-10', jan11Jst)).toBe(true);
  });
});
