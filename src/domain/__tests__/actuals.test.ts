import { describe, expect, it } from 'vitest';
import { compareWithActuals } from '../actuals';
import type { ActualValues, CalculationResult, Yen } from '../types';

/**
 * ここで使う金額はすべて説明用の架空の数値であり、実在の源泉徴収票・住民税決定通知書の値ではない
 * (Issue #12: 実データはリポジトリにコミットしない方針。実データでの検証はユーザー自身がローカルで
 * 検算モード画面を使って行う運用とする)。
 */
function buildResult(overrides: {
  incomeTaxTotal?: number;
  residentIncomeLevyFinal?: number;
  residentPerCapitaLevy?: number;
  housingLoanUsedIncomeTax?: number;
  residentHousingLoanApplied?: number;
}): CalculationResult {
  const zero = 0 as Yen;
  return {
    income: { grossTotal: zero, salaryDeduction: zero, salaryIncome: zero, totalIncome: zero, nonTaxableBenefits: zero },
    incomeTax: {
      deductions: {
        basic: zero,
        socialInsurance: zero,
        lifeInsurance: zero,
        earthquakeInsurance: zero,
        medical: zero,
        ideco: zero,
        spouse: zero,
        dependents: zero,
        disability: zero,
        singleParent: zero,
        donation: zero,
        total: zero,
      },
      taxableIncome: zero,
      marginalRate: 0,
      calculatedTax: zero,
      housingLoanApplied: (overrides.housingLoanUsedIncomeTax ?? 0) as Yen,
      taxAfterCredits: zero,
      reconstructionTax: zero,
      total: (overrides.incomeTaxTotal ?? 0) as Yen,
    },
    residentTax: {
      deductions: {
        basic: zero,
        socialInsurance: zero,
        lifeInsurance: zero,
        earthquakeInsurance: zero,
        medical: zero,
        ideco: zero,
        spouse: zero,
        dependents: zero,
        disability: zero,
        singleParent: zero,
        donation: zero,
        total: zero,
      },
      taxableIncome: zero,
      incomeLevyBeforeAdj: zero,
      adjustmentCredit: zero,
      incomeLevy: zero,
      furusatoCreditBasic: zero,
      furusatoCreditSpecial: zero,
      housingLoanApplied: (overrides.residentHousingLoanApplied ?? 0) as Yen,
      incomeLevyFinal: (overrides.residentIncomeLevyFinal ?? 0) as Yen,
      perCapitaLevy: (overrides.residentPerCapitaLevy ?? 0) as Yen,
      total: zero,
    },
    housingLoan: {
      creditAvailable: zero,
      usedInIncomeTax: (overrides.housingLoanUsedIncomeTax ?? 0) as Yen,
      carriedToResidentTax: zero,
      residentTaxCap: zero,
      wasted: zero,
    },
    furusato: {
      limitAmount: zero,
      recommendedAmount: zero,
      approxByFormula: zero,
      breakdown: { donation: zero, incomeTaxReduction: zero, residentBasic: zero, residentSpecial: zero, selfBurden: zero },
      specialCapReached: false,
    },
    warnings: [],
    trace: [],
  };
}

describe('compareWithActuals(Issue #12 FR-17検算モード)', () => {
  it('actualsが空の場合、比較項目が無くwithinTolerance=trueになる(未検算と不一致を区別する)', () => {
    const result = buildResult({});
    const actuals: ActualValues = { source: 'withholding' };
    expect(compareWithActuals(result, actuals)).toEqual({ items: [], withinTolerance: true });
  });

  it('入力済みのフィールドのみが比較対象になる', () => {
    const result = buildResult({ incomeTaxTotal: 100_000, residentPerCapitaLevy: 5_000 });
    const actuals: ActualValues = { source: 'withholding', incomeTaxTotal: 100_000 };
    const { items } = compareWithActuals(result, actuals);
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('源泉徴収税額(所得税+復興特別所得税)');
  });

  it('誤差が1%以内ならwithinTolerance=trueになる', () => {
    const result = buildResult({ incomeTaxTotal: 100_500 });
    const actuals: ActualValues = { source: 'withholding', incomeTaxTotal: 100_000 };
    const { items, withinTolerance } = compareWithActuals(result, actuals);
    expect(items[0].diffAbs).toBe(500);
    expect(items[0].diffPct).toBeCloseTo(0.5, 5);
    expect(withinTolerance).toBe(true);
  });

  it('誤差が1%を超えるとwithinTolerance=falseになる', () => {
    const result = buildResult({ incomeTaxTotal: 103_000 });
    const actuals: ActualValues = { source: 'withholding', incomeTaxTotal: 100_000 };
    const { items, withinTolerance } = compareWithActuals(result, actuals);
    expect(items[0].diffPct).toBeCloseTo(3, 5);
    expect(withinTolerance).toBe(false);
  });

  it('実績値が0円で計算値も0円なら一致(0%)扱いになる', () => {
    const result = buildResult({ housingLoanUsedIncomeTax: 0 });
    const actuals: ActualValues = { source: 'withholding', housingLoanUsedIncomeTax: 0 };
    const { items, withinTolerance } = compareWithActuals(result, actuals);
    expect(items[0].diffPct).toBe(0);
    expect(withinTolerance).toBe(true);
  });

  it('実績値が0円で計算値が0円でない場合はwithinTolerance=falseになる(0除算を避けつつ不一致として扱う)', () => {
    const result = buildResult({ housingLoanUsedIncomeTax: 5_000 });
    const actuals: ActualValues = { source: 'withholding', housingLoanUsedIncomeTax: 0 };
    const { items, withinTolerance } = compareWithActuals(result, actuals);
    expect(items[0].diffPct).toBe(Infinity);
    expect(withinTolerance).toBe(false);
  });

  it('複数項目のうち1つでも1%を超えればwithinTolerance全体がfalseになる', () => {
    const result = buildResult({ incomeTaxTotal: 100_000, residentIncomeLevyFinal: 50_000 });
    const actuals: ActualValues = { source: 'residentTaxNotice', incomeTaxTotal: 100_000, residentIncomeLevy: 45_000 };
    const { withinTolerance } = compareWithActuals(result, actuals);
    expect(withinTolerance).toBe(false);
  });

  it('5項目すべてに対応する比較ラベルが生成される(§10.10対応表)', () => {
    const result = buildResult({
      incomeTaxTotal: 1,
      residentIncomeLevyFinal: 1,
      residentPerCapitaLevy: 1,
      housingLoanUsedIncomeTax: 1,
      residentHousingLoanApplied: 1,
    });
    const actuals: ActualValues = {
      source: 'residentTaxNotice',
      incomeTaxTotal: 1,
      residentIncomeLevy: 1,
      residentPerCapita: 1,
      housingLoanUsedIncomeTax: 1,
      housingLoanUsedResident: 1,
    };
    const { items } = compareWithActuals(result, actuals);
    expect(items).toHaveLength(5);
    expect(items.map((i) => i.label)).toEqual([
      '源泉徴収税額(所得税+復興特別所得税)',
      '住民税所得割額',
      '住民税均等割額',
      '住宅ローン控除(所得税から控除)',
      '住宅ローン控除(住民税から控除)',
    ]);
  });
});
