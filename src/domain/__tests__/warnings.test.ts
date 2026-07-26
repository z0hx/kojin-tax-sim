import { describe, expect, it } from 'vitest';
import { calcSnapshot } from '../engine';
import { estimateAnnualIncome } from '../income';
import { findFurusatoLimit } from '../furusato';
import type { Yen } from '../types';
import { checkW01, checkW02, checkW03, checkW04, checkW05, checkW06, checkW07, runAllWarningChecks } from '../warnings';
import { TAX_PARAMS_2026, makeM1Profile, makeProfile, monthlyAllYear } from './testHelpers';

function buildContext(profile: ReturnType<typeof makeProfile>, donation = 0) {
  const snapshotAtZero = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
  const snapshotAtDonated = calcSnapshot(profile, donation as Yen, TAX_PARAMS_2026, 'standard');
  const limitResult = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
  const incomeEstimate = estimateAnnualIncome(profile.income, { fillMode: 'lastActual' });
  return { snapshotAtZero, snapshotAtDonated, limitResult, profile, incomeEstimate };
}

describe('W-01: 差引所得税額が0円', () => {
  it('住宅ローン控除で所得税がゼロになるケースで発火する', () => {
    const ctx = buildContext(makeM1Profile(32_000_000));
    expect(checkW01(ctx)).not.toBeNull();
  });
  it('所得税が発生するケースでは発火しない', () => {
    const profile = makeProfile({ income: { monthly: monthlyAllYear(2_000_000, 200_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 } });
    const ctx = buildContext(profile);
    expect(checkW01(ctx)).toBeNull();
  });
  it('住宅ローンが無い場合は所得税が0円でも発火しない(レビュー指摘Medium#6是正)', () => {
    // 所得が低く、住宅ローンも組んでいない(育休で大幅減収した年などを想定)
    const profile = makeProfile({
      income: { monthly: monthlyAllYear(100_000, 10_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 },
    });
    const ctx = buildContext(profile);
    expect(ctx.snapshotAtZero.incomeTax.taxAfterCredits).toBe(0);
    expect(checkW01(ctx)).toBeNull();
  });
});

describe('W-02: 住宅ローン控除の切り捨て損失', () => {
  it('切り捨て損失が発生するケースで発火する', () => {
    const ctx = buildContext(makeM1Profile(32_000_000));
    expect(checkW02(ctx)).not.toBeNull();
  });
  it('切り捨て損失がないケースでは発火しない', () => {
    const ctx = buildContext(makeM1Profile(5_000_000));
    expect(checkW02(ctx)).toBeNull();
  });
});

describe('W-03: 寄附により切り捨て損失が増加', () => {
  it('寄附ありのスナップショットで損失が増えていれば発火する', () => {
    const ctx = buildContext(makeM1Profile(32_000_000), 200_000);
    expect(checkW03(ctx)).not.toBeNull();
  });
});

describe('W-04: 医療費控除ありでワンストップ特例を選択', () => {
  it('医療費が入力されているのにoneStopのままなら発火する', () => {
    const profile = makeProfile();
    profile.deductions.medical = { paid: 300_000, reimbursed: 0, selfMedication: 0, mode: 'medical' };
    const ctx = buildContext(profile);
    expect(checkW04(ctx)).not.toBeNull();
  });
  it('taxReturnを選択していれば発火しない', () => {
    const profile = makeProfile({ furusato: { method: 'taxReturn', donatedAmount: 0, safetyRatio: 0.9 } });
    profile.deductions.medical = { paid: 300_000, reimbursed: 0, selfMedication: 0, mode: 'medical' };
    const ctx = buildContext(profile);
    expect(checkW04(ctx)).toBeNull();
  });
});

describe('W-05: 所得割非課税', () => {
  it('所得がなければ発火する', () => {
    const ctx = buildContext(makeProfile());
    expect(checkW05(ctx)).not.toBeNull();
  });
});

describe('W-06: 収入見込みの確定率が低い', () => {
  it('実績月が6ヶ月未満なら発火する', () => {
    const profile = makeProfile({
      income: {
        monthly: [
          ...monthlyAllYear(400_000, 60_000).slice(0, 3).map((m) => ({ ...m, status: 'actual' as const })),
          ...monthlyAllYear(400_000, 60_000).slice(3).map((m) => ({ ...m, status: 'estimated' as const })),
        ],
        bonuses: [],
        leavePeriods: [],
        otherSalaryIncome: 0,
      },
    });
    const ctx = buildContext(profile);
    expect(checkW06(ctx)).not.toBeNull();
  });
});

describe('W-07: 特例分が20%枠に到達', () => {
  it('実際の寄附額が20%枠に到達していれば発火する(M1モデルケース、寄附20万円)', () => {
    const ctx = buildContext(makeM1Profile(32_000_000), 200_000);
    expect(checkW07(ctx)).not.toBeNull();
  });
  it('理論上の上限額(探索結果)ではなく実際の寄附額で判定するため、寄附額0円では発火しない', () => {
    const ctx = buildContext(makeM1Profile(32_000_000), 0);
    expect(checkW07(ctx)).toBeNull();
  });
});

describe('runAllWarningChecks', () => {
  it('該当しない警告はnullを含めず配列から除外される', () => {
    const ctx = buildContext(makeM1Profile(32_000_000));
    const warnings = runAllWarningChecks(ctx);
    expect(warnings.every((w) => w !== null)).toBe(true);
    expect(warnings.some((w) => w.id === 'W-01')).toBe(true);
  });
});
