import { describe, expect, it } from 'vitest';
import { calcCalculatedTax, calcReconstructionTax, calcTaxableIncome, lookupTaxRate } from '../incomeTax';
import type { Yen } from '../types';
import { TAX_PARAMS_2026 } from './testHelpers';

describe('calcTaxableIncome (T-16 端数処理)', () => {
  it('1,000円未満を切り捨てる', () => {
    expect(calcTaxableIncome(3_560_999 as Yen, 1_830_000 as Yen)).toBe(1_730_000);
  });
  it('控除が所得を上回る場合は0円(マイナスにならない)', () => {
    expect(calcTaxableIncome(1_000_000 as Yen, 2_000_000 as Yen)).toBe(0);
  });
});

describe('lookupTaxRate (T-04 税率帯の境界)', () => {
  const brackets = TAX_PARAMS_2026.incomeTax.brackets;
  it('1,950,000円ちょうどは5%', () => {
    expect(lookupTaxRate(1_950_000 as Yen, brackets)).toEqual({ rate: 0.05, offset: 0 });
  });
  it('1,950,001円は10%', () => {
    expect(lookupTaxRate(1_950_001 as Yen, brackets).rate).toBe(0.1);
  });
  it('3,300,000円ちょうどは10%', () => {
    expect(lookupTaxRate(3_300_000 as Yen, brackets)).toEqual({ rate: 0.1, offset: 97_500 });
  });
  it('6,950,000円ちょうどは20%', () => {
    expect(lookupTaxRate(6_950_000 as Yen, brackets)).toEqual({ rate: 0.2, offset: 427_500 });
  });
  it('6,950,001円は23%', () => {
    expect(lookupTaxRate(6_950_001 as Yen, brackets).rate).toBe(0.23);
  });
});

describe('calcCalculatedTax', () => {
  it('課税所得×税率-控除額', () => {
    expect(calcCalculatedTax(1_730_000 as Yen, 0.05, 0 as Yen)).toBe(86_500);
  });
});

describe('calcReconstructionTax', () => {
  it('差引所得税額×2.1%を100円未満切り捨て', () => {
    expect(calcReconstructionTax(100_000 as Yen, 0.021)).toBe(2_100);
  });
  it('差引所得税額が0円なら復興特別所得税も0円', () => {
    expect(calcReconstructionTax(0 as Yen, 0.021)).toBe(0);
  });
});
