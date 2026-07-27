import { describe, expect, it } from 'vitest';
import { applyToIncomeTax, applyToResidentTax, calcCreditAvailable, calcResidentTaxCap, calcResidentTaxCapDetail } from '../housingLoan';
import type { HousingLoanInput, Yen } from '../types';
import { TAX_PARAMS_2026 } from './testHelpers';

const baseLoan: HousingLoanInput = {
  moveInYear: 2023,
  years: 13,
  rate: 0.007,
  yearEndBalance: 32_000_000,
  borrowingCap: 40_000_000,
  residentTaxCapRule: 'rule5pct97500',
};

describe('calcCreditAvailable', () => {
  it('年末残高×控除率(0.7%)', () => {
    expect(calcCreditAvailable(baseLoan, 2026)).toBe(224_000);
  });
  it('借入限度額を超える残高は限度額でキャップされる', () => {
    expect(calcCreditAvailable({ ...baseLoan, yearEndBalance: 50_000_000, borrowingCap: 30_000_000 }, 2026)).toBe(210_000);
  });
  it('住宅ローン入力がない場合は0円', () => {
    expect(calcCreditAvailable(undefined, 2026)).toBe(0);
  });
  it('適用期間(入居年+years-1)を過ぎている場合は0円(Low#10)', () => {
    // moveInYear=2023, years=13 → 適用最終年は2035年
    expect(calcCreditAvailable(baseLoan, 2036)).toBe(0);
  });
  it('入居年より前の年は0円', () => {
    expect(calcCreditAvailable(baseLoan, 2022)).toBe(0);
  });
  it('適用期間の最終年はまだ控除が適用される', () => {
    expect(calcCreditAvailable(baseLoan, 2035)).toBe(224_000);
  });
});

describe('applyToIncomeTax (T-05 所得税ゼロ / T-06 切り捨て損失)', () => {
  it('控除可能額が算出所得税額を上回る場合、所得税は使い切って残りが繰り越される', () => {
    const { used, carried } = applyToIncomeTax(224_000 as Yen, 86_500 as Yen);
    expect(used).toBe(86_500);
    expect(carried).toBe(224_000 - 86_500);
  });
  it('控除可能額が算出所得税額以下の場合、全額を所得税から控除し繰越は0円', () => {
    const { used, carried } = applyToIncomeTax(50_000 as Yen, 86_500 as Yen);
    expect(used).toBe(50_000);
    expect(carried).toBe(0);
  });
});

describe('calcResidentTaxCap', () => {
  it('rule5pct97500: 課税総所得×5%と97,500円の小さいほう', () => {
    expect(calcResidentTaxCap(2_352_000 as Yen, 'rule5pct97500', TAX_PARAMS_2026.residentTax.housingLoanCapRules)).toBe(97_500);
  });
  it('課税総所得が低ければ5%のほうが小さくなる', () => {
    expect(calcResidentTaxCap(1_000_000 as Yen, 'rule5pct97500', TAX_PARAMS_2026.residentTax.housingLoanCapRules)).toBe(50_000);
  });
  it('rule7pct136500: 課税総所得×7%と136,500円の小さいほう', () => {
    expect(calcResidentTaxCap(3_000_000 as Yen, 'rule7pct136500', TAX_PARAMS_2026.residentTax.housingLoanCapRules)).toBe(136_500);
  });
  it('住宅ローン入力がない場合は0円', () => {
    expect(calcResidentTaxCap(2_352_000 as Yen, undefined, TAX_PARAMS_2026.residentTax.housingLoanCapRules)).toBe(0);
  });
});

describe('calcResidentTaxCapDetail(Issue #8: S-04画面の上限内訳表示用)', () => {
  it('比率ベースの額が定額上限より小さい場合、appliedは比率ベースの額になる', () => {
    const detail = calcResidentTaxCapDetail(1_000_000 as Yen, 'rule5pct97500', TAX_PARAMS_2026.residentTax.housingLoanCapRules);
    expect(detail).toEqual({ ratioBased: 50_000, fixed: 97_500, applied: 50_000, ratio: 0.05 });
  });
  it('比率ベースの額が定額上限を超える場合、appliedは定額上限になる', () => {
    const detail = calcResidentTaxCapDetail(2_352_000 as Yen, 'rule5pct97500', TAX_PARAMS_2026.residentTax.housingLoanCapRules);
    expect(detail).toEqual({ ratioBased: 117_600, fixed: 97_500, applied: 97_500, ratio: 0.05 });
  });
  it('rule7pct136500の場合、ratioは0.07になる', () => {
    const detail = calcResidentTaxCapDetail(3_000_000 as Yen, 'rule7pct136500', TAX_PARAMS_2026.residentTax.housingLoanCapRules);
    expect(detail).toEqual({ ratioBased: 210_000, fixed: 136_500, applied: 136_500, ratio: 0.07 });
  });
  it('ruleが無い場合はすべて0', () => {
    expect(calcResidentTaxCapDetail(2_352_000 as Yen, undefined, TAX_PARAMS_2026.residentTax.housingLoanCapRules)).toEqual({
      ratioBased: 0,
      fixed: 0,
      applied: 0,
      ratio: 0,
    });
  });
  it('calcResidentTaxCapはcalcResidentTaxCapDetail().appliedと一致する(リファクタの後方互換性)', () => {
    const detail = calcResidentTaxCapDetail(2_352_000 as Yen, 'rule5pct97500', TAX_PARAMS_2026.residentTax.housingLoanCapRules);
    expect(calcResidentTaxCap(2_352_000 as Yen, 'rule5pct97500', TAX_PARAMS_2026.residentTax.housingLoanCapRules)).toBe(detail.applied);
  });
});

describe('applyToResidentTax', () => {
  it('繰越額が上限を超える場合、超過分が切り捨て損失になる', () => {
    const { used, wasted } = applyToResidentTax(137_500 as Yen, 97_500 as Yen, 233_288 as Yen);
    expect(used).toBe(97_500);
    expect(wasted).toBe(40_000);
  });
  it('所得割額(availableLevy)が上限より小さい場合はそちらが優先される', () => {
    const { used, wasted } = applyToResidentTax(137_500 as Yen, 97_500 as Yen, 50_000 as Yen);
    expect(used).toBe(50_000);
    expect(wasted).toBe(137_500 - 50_000);
  });
});
