import { describe, expect, it } from 'vitest';
import { asYen, floor100, floor1000, floorTo, floorYen, ValidationError } from '../types';

describe('floor helpers', () => {
  it('floorTo: 指定した単位未満を切り捨てる', () => {
    expect(floorTo(1999, 1000)).toBe(1000);
    expect(floorTo(2000, 1000)).toBe(2000);
  });
  it('floor1000 / floor100 / floorYen', () => {
    expect(floor1000(1_730_999)).toBe(1_730_000);
    expect(floor100(233_288)).toBe(233_200);
    expect(floorYen(123.9)).toBe(123);
  });
});

describe('asYen', () => {
  it('非負整数はそのまま返す', () => {
    expect(asYen(1000)).toBe(1000);
  });
  it('負の数はValidationErrorを投げる', () => {
    expect(() => asYen(-1)).toThrow(ValidationError);
  });
  it('小数はValidationErrorを投げる', () => {
    expect(() => asYen(100.5)).toThrow(ValidationError);
  });
  it('ValidationErrorはissuesを持つ', () => {
    try {
      asYen(-1);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).issues[0].field).toBe('amount');
    }
  });
});
