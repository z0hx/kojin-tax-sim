import { describe, expect, it } from 'vitest';
import { formatRateAsPercent, parseNonNegativeInt, parsePercentToRate } from '../parseAmount';

describe('parseNonNegativeInt', () => {
  it('0以上の整数を返す', () => {
    expect(parseNonNegativeInt('123')).toBe(123);
    expect(parseNonNegativeInt('0')).toBe(0);
  });
  it('負数・小数・非数値はnull', () => {
    expect(parseNonNegativeInt('-1')).toBeNull();
    expect(parseNonNegativeInt('1.5')).toBeNull();
    expect(parseNonNegativeInt('abc')).toBeNull();
  });
});

describe('parsePercentToRate(Issue #8: 住宅ローン控除率入力の%→小数変換)', () => {
  it('0.7/100の浮動小数点誤差を吸収し0.007を返す', () => {
    expect(parsePercentToRate('0.7')).toBe(0.007);
  });
  it('1%は0.01を返す', () => {
    expect(parsePercentToRate('1')).toBe(0.01);
  });
  it('負数・非数値はnull', () => {
    expect(parsePercentToRate('-1')).toBeNull();
    expect(parsePercentToRate('abc')).toBeNull();
  });
});

describe('formatRateAsPercent', () => {
  it('0.007を"0.7"に変換する(丸め誤差の桁を落とす)', () => {
    expect(formatRateAsPercent(0.007)).toBe('0.7');
  });
  it('parsePercentToRateとの往復で元の表示に戻る', () => {
    const rate = parsePercentToRate('0.7')!;
    expect(formatRateAsPercent(rate)).toBe('0.7');
  });
});
