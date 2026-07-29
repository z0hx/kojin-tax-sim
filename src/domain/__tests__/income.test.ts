import { describe, expect, it } from 'vitest';
import {
  applyLeavePeriods,
  calcSalaryDeduction,
  calcSalaryIncome,
  estimateAnnualIncome,
  isBonusExempt,
  monthsInRange,
  resolveMonthlySocialInsurance,
  sumMonthlySocialInsurance,
  sumNonTaxableBenefits,
} from '../income';
import type { Yen } from '../types';
import { TAX_PARAMS_2025, TAX_PARAMS_2026, emptyIncome, monthlyAllYear } from './testHelpers';

describe('calcSalaryDeduction (T-02 給与所得控除の境界値)', () => {
  it('最低保障額(2025)が適用される: 収入1,625,000円以下', () => {
    expect(calcSalaryDeduction(1_625_000 as Yen, TAX_PARAMS_2025.incomeTax.salaryDeduction)).toBe(650_000);
  });

  it('〜1,800,000円ちょうど: 最低保障額のほうが大きいためそちらが採用される(2025)', () => {
    // 1,800,000×40%-100,000 = 620,000 < 最低保障額650,000
    expect(calcSalaryDeduction(1_800_000 as Yen, TAX_PARAMS_2025.incomeTax.salaryDeduction)).toBe(650_000);
  });

  it('〜3,600,000円ちょうど: 収入×30%+80,000', () => {
    expect(calcSalaryDeduction(3_600_000 as Yen, TAX_PARAMS_2025.incomeTax.salaryDeduction)).toBe(3_600_000 * 0.3 + 80_000);
  });

  it('〜6,600,000円ちょうど: 収入×20%+440,000', () => {
    expect(calcSalaryDeduction(6_600_000 as Yen, TAX_PARAMS_2025.incomeTax.salaryDeduction)).toBe(6_600_000 * 0.2 + 440_000);
  });

  it('〜8,500,000円ちょうど: 収入×10%+1,100,000', () => {
    expect(calcSalaryDeduction(8_500_000 as Yen, TAX_PARAMS_2025.incomeTax.salaryDeduction)).toBe(8_500_000 * 0.1 + 1_100_000);
  });

  it('8,500,001円〜: 上限1,950,000円', () => {
    expect(calcSalaryDeduction(20_000_000 as Yen, TAX_PARAMS_2025.incomeTax.salaryDeduction)).toBe(1_950_000);
  });

  it('2026年分: 低所得者の時限措置(収入220万円以下は74万円)', () => {
    expect(calcSalaryDeduction(2_000_000 as Yen, TAX_PARAMS_2026.incomeTax.salaryDeduction)).toBe(740_000);
  });

  it('2026年分: 220万円を1円超えると通常の最低保障額(69万円)に戻る', () => {
    // 2,200,001×40%-100,000 = 780,000.4 > 690,000 なので式の値が採用される
    const result = calcSalaryDeduction(2_200_001 as Yen, TAX_PARAMS_2026.incomeTax.salaryDeduction);
    expect(result).toBeGreaterThan(690_000);
  });
});

describe('calcSalaryIncome', () => {
  it('gross - deduction を返す', () => {
    const gross = 5_000_000 as Yen;
    const deduction = calcSalaryDeduction(gross, TAX_PARAMS_2026.incomeTax.salaryDeduction);
    expect(calcSalaryIncome(gross, TAX_PARAMS_2026.incomeTax.salaryDeduction)).toBe(gross - deduction);
  });
});

describe('monthsInRange / applyLeavePeriods (T-09/T-10 育休ケース)', () => {
  it('年をまたぐ育休(2025-07〜2026-01)から2025年分の月を切り出す', () => {
    expect(monthsInRange('2025-07', '2026-01', 2025)).toEqual([7, 8, 9, 10, 11, 12]);
  });

  it('年をまたぐ育休から2026年分の月を切り出す', () => {
    expect(monthsInRange('2025-07', '2026-01', 2026)).toEqual([1]);
  });

  it('育休期間中の月はgrossSalary・socialInsuranceが0になり、免除フラグが立つ', () => {
    const income = {
      ...emptyIncome(),
      monthly: monthlyAllYear(400_000, 60_000),
      leavePeriods: [{ type: 'childcare' as const, startYm: '2025-07', endYm: '2026-01', benefitAmount: 200_000 }],
    };
    const result = applyLeavePeriods(income, 2025);
    for (const m of result.monthly) {
      if (m.month >= 7) {
        expect(m.grossSalary).toBe(0);
        expect(m.socialInsurance).toBe(0);
        expect(m.isSocialInsuranceExempt).toBe(true);
      } else {
        expect(m.grossSalary).toBe(400_000);
        expect(m.isSocialInsuranceExempt).toBe(false);
      }
    }
  });

  it('元のIncomeInputを変更しない(純粋関数であること)', () => {
    const income = { ...emptyIncome(), monthly: monthlyAllYear(400_000, 60_000), leavePeriods: [{ type: 'childcare' as const, startYm: '2025-07', endYm: '2026-01', benefitAmount: 200_000 }] };
    const before = JSON.stringify(income);
    applyLeavePeriods(income, 2025);
    expect(JSON.stringify(income)).toBe(before);
  });
});

describe('isBonusExempt', () => {
  const leaves = [{ type: 'childcare' as const, startYm: '2025-07', endYm: '2026-01', benefitAmount: 0 }];

  it('2ヶ月以上の育休期間中の賞与月は免除される', () => {
    expect(isBonusExempt({ label: '冬季賞与', month: 12, status: 'actual', gross: 500_000, socialInsurance: 0, isExempt: false }, leaves, 2025)).toBe(true);
  });

  it('育休期間外の賞与月は免除されない', () => {
    expect(isBonusExempt({ label: '夏季賞与', month: 6, status: 'actual', gross: 500_000, socialInsurance: 0, isExempt: false }, leaves, 2025)).toBe(false);
  });
});

describe('sumNonTaxableBenefits (FR-04)', () => {
  it('育休給付金の合計を返す(課税計算には使わない値として分離)', () => {
    const income = {
      ...emptyIncome(),
      leavePeriods: [{ type: 'childcare' as const, startYm: '2025-07', endYm: '2025-12', benefitAmount: 1_200_000 }],
    };
    expect(sumNonTaxableBenefits(income)).toBe(1_200_000);
  });
});

describe('estimateAnnualIncome (FR-03 / W-06)', () => {
  it('実績6ヶ月なら確定率0.5になる', () => {
    const income = {
      ...emptyIncome(),
      monthly: [
        ...monthlyAllYear(400_000, 60_000).slice(0, 6).map((m) => ({ ...m, status: 'actual' as const })),
        ...monthlyAllYear(0, 0).slice(6).map((m) => ({ ...m, status: 'estimated' as const })),
      ],
    };
    const result = estimateAnnualIncome(income, { fillMode: 'lastActual' });
    expect(result.confidenceRatio).toBe(0.5);
  });

  it('見込み月を直近実績月の値で埋める', () => {
    const income = {
      ...emptyIncome(),
      monthly: [
        ...monthlyAllYear(400_000, 60_000).slice(0, 6).map((m) => ({ ...m, status: 'actual' as const })),
        ...monthlyAllYear(0, 0).slice(6).map((m) => ({ ...m, status: 'estimated' as const })),
      ],
    };
    const result = estimateAnnualIncome(income, { fillMode: 'lastActual' });
    for (const m of result.filledIncome.monthly.slice(6)) {
      expect(m.grossSalary).toBe(400_000);
    }
  });

  it('直近実績月が内訳入力なら、見込み月も内訳ごと写す(Issue #48)', () => {
    const breakdown = { healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 };
    const income = {
      ...emptyIncome(),
      monthly: [
        ...monthlyAllYear(400_000, 0)
          .slice(0, 6)
          .map((m) => ({ ...m, status: 'actual' as const, socialInsuranceInputMode: 'breakdown' as const, socialInsuranceBreakdown: breakdown })),
        ...monthlyAllYear(0, 0)
          .slice(6)
          .map((m) => ({ ...m, status: 'estimated' as const })),
      ],
    };

    const result = estimateAnnualIncome(income, { fillMode: 'lastActual' });

    for (const m of result.filledIncome.monthly.slice(6)) {
      expect(m.socialInsuranceInputMode).toBe('breakdown');
      expect(m.socialInsuranceBreakdown).toEqual(breakdown);
    }
    expect(sumMonthlySocialInsurance(result.filledIncome)).toBe(58_000 * 12);
  });

  it('平均で埋める場合は内訳に分解できないため一括入力として入れる(Issue #48)', () => {
    const income = {
      ...emptyIncome(),
      monthly: [
        ...monthlyAllYear(400_000, 0)
          .slice(0, 6)
          .map((m) => ({
            ...m,
            status: 'actual' as const,
            socialInsuranceInputMode: 'breakdown' as const,
            socialInsuranceBreakdown: { healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 },
          })),
        ...monthlyAllYear(0, 0)
          .slice(6)
          .map((m) => ({ ...m, status: 'estimated' as const, socialInsuranceInputMode: 'breakdown' as const })),
      ],
    };

    const result = estimateAnnualIncome(income, { fillMode: 'average' });

    for (const m of result.filledIncome.monthly.slice(6)) {
      expect(m.socialInsuranceInputMode).toBe('total');
      expect(m.socialInsuranceBreakdown).toBeUndefined();
      expect(m.socialInsurance).toBe(58_000);
    }
  });
});

describe('resolveMonthlySocialInsurance (Issue #48 社会保険料の内訳入力)', () => {
  const base = monthlyAllYear(400_000, 60_000)[0];

  it('既定(モード未指定)では一括入力額を返す', () => {
    expect(resolveMonthlySocialInsurance(base)).toBe(60_000);
  });

  it("モードが'breakdown'なら内訳の合計を返す(一括入力額は使わない)", () => {
    const rec = {
      ...base,
      socialInsuranceInputMode: 'breakdown' as const,
      socialInsuranceBreakdown: { healthInsurance: 20_000, nursingCare: 5_000, pension: 36_000, employmentInsurance: 2_000, other: 1_000 },
    };
    expect(resolveMonthlySocialInsurance(rec)).toBe(64_000);
  });

  it("モードが'breakdown'でも内訳が無ければ一括入力額を返す(取り込んだデータの欠損に備える)", () => {
    expect(resolveMonthlySocialInsurance({ ...base, socialInsuranceInputMode: 'breakdown' })).toBe(60_000);
  });

  it('内訳入力の月も社会保険料の年間合計に算入される', () => {
    const income = {
      ...emptyIncome(),
      monthly: monthlyAllYear(400_000, 60_000).map((m, i) =>
        i === 0
          ? {
              ...m,
              socialInsuranceInputMode: 'breakdown' as const,
              socialInsuranceBreakdown: { healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 },
            }
          : m
      ),
    };
    expect(sumMonthlySocialInsurance(income)).toBe(58_000 + 60_000 * 11);
  });

  it('育休対象月は内訳入力でも0円になる(applyLeavePeriodsが内訳を落とす)', () => {
    const income = {
      ...emptyIncome(),
      monthly: monthlyAllYear(400_000, 60_000).map((m) => ({
        ...m,
        socialInsuranceInputMode: 'breakdown' as const,
        socialInsuranceBreakdown: { healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 },
      })),
      leavePeriods: [{ type: 'childcare' as const, startYm: '2026-01', endYm: '2026-12', benefitAmount: 0 }],
    };

    const applied = applyLeavePeriods(income, 2026);

    expect(sumMonthlySocialInsurance(applied)).toBe(0);
  });
});
