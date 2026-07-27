import { describe, expect, it } from 'vitest';
import { buildCalculationResult } from '../engine';
import { TAX_PARAMS_2026, makeM1Profile, makeProfile, monthlyAllYear } from './testHelpers';

describe('buildCalculationResult', () => {
  it('標準的な収入のプロファイルで上限額・推奨額・警告一式を組み立てる', () => {
    const profile = makeProfile({
      income: { monthly: monthlyAllYear(500_000, 75_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 },
    });
    const result = buildCalculationResult(profile, TAX_PARAMS_2026);

    expect(result.furusato.limitAmount).toBeGreaterThan(0);
    expect(result.furusato.recommendedAmount).toBeLessThanOrEqual(result.furusato.limitAmount);
    expect(result.furusatoConservative.limitAmount).toBeGreaterThan(0);
    expect(result.trace.length).toBeGreaterThan(0);
    expect(Array.isArray(result.warnings)).toBe(true);
  });

  it('住宅ローン控除で所得税が0円になるケースはW-01・W-02が含まれる', () => {
    const profile = makeM1Profile(32_000_000);
    const result = buildCalculationResult(profile, TAX_PARAMS_2026);
    const ids = result.warnings.map((w) => w.id);
    expect(ids).toContain('W-01');
    expect(ids).toContain('W-02');
  });

  it('寄附実績(donatedAmount)を反映したincomeTax/residentTaxの値を返す(探索上の上限とは独立)', () => {
    const profile = makeM1Profile(32_000_000);
    profile.furusato.donatedAmount = 200_000;
    const result = buildCalculationResult(profile, TAX_PARAMS_2026);
    expect(result.residentTax.incomeLevyFinal).toBe(69_300);
    const ids = result.warnings.map((w) => w.id);
    expect(ids).toContain('W-03');
    expect(ids).toContain('W-07');
  });

  it('所得がない場合は上限0円で所得割非課税の警告が出る', () => {
    const result = buildCalculationResult(makeProfile(), TAX_PARAMS_2026);
    expect(result.furusato.limitAmount).toBe(0);
    expect(result.warnings.map((w) => w.id)).toContain('W-05');
  });

  it('confidenceRatio(実績月数/12)を戻り値に含む(S-02収入入力画面向け)', () => {
    const actualSix = monthlyAllYear(400_000, 60_000)
      .slice(0, 6)
      .map((m) => ({ ...m, status: 'actual' as const }));
    const estimatedSix = monthlyAllYear(0, 0)
      .slice(6)
      .map((m) => ({ ...m, status: 'estimated' as const }));
    const profile = makeProfile({
      income: { monthly: [...actualSix, ...estimatedSix], bonuses: [], leavePeriods: [], otherSalaryIncome: 0 },
    });
    const result = buildCalculationResult(profile, TAX_PARAMS_2026);
    expect(result.confidenceRatio).toBe(0.5);
  });
});
