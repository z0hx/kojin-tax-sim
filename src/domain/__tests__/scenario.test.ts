import { describe, expect, it } from 'vitest';
import { applyScenarioOverride, compareScenarios, runScenario } from '../scenario';
import { buildCalculationResult } from '../engine';
import type { Yen } from '../types';
import { TAX_PARAMS_2026, makeProfile, monthlyAllYear } from './testHelpers';

describe('applyScenarioOverride(Issue #13 FR-16シナリオ比較)', () => {
  it('overrideを何も指定しなければ元のプロファイルと同じ内容になる', () => {
    const base = makeProfile({ income: monthlyAllYearProfileIncome() });
    const result = applyScenarioOverride(base, { label: '変更なし' });
    expect(result).toEqual(base);
  });

  it('reinstatementMonth: childcare育休期間のendYmを対象年の指定月に置き換える', () => {
    const base = makeProfile({
      income: {
        ...monthlyAllYearProfileIncome(),
        leavePeriods: [{ type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 300_000 }],
      },
    });
    const result = applyScenarioOverride(base, { label: '早期復職', reinstatementMonth: 2 });
    expect(result.income.leavePeriods).toEqual([{ type: 'childcare', startYm: '2026-01', endYm: '2026-02', benefitAmount: 300_000 }]);
    // baseは変更されていない
    expect(base.income.leavePeriods[0].endYm).toBe('2026-03');
  });

  it('reinstatementMonth: childcare以外の育休期間は変更しない', () => {
    const base = makeProfile({
      income: {
        ...monthlyAllYearProfileIncome(),
        leavePeriods: [{ type: 'maternity', startYm: '2026-01', endYm: '2026-03', benefitAmount: 0 }],
      },
    });
    const result = applyScenarioOverride(base, { label: '復職月変更', reinstatementMonth: 2 });
    expect(result.income.leavePeriods[0].endYm).toBe('2026-03');
  });

  it('reinstatementMonth: 育休が2件ある場合はstartYmが最も早い1件のみ変更する(実装後レビュー対応: 全件変更すると2件目が反転・消滅しうる)', () => {
    const base = makeProfile({
      income: {
        ...monthlyAllYearProfileIncome(),
        leavePeriods: [
          { type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 0 },
          { type: 'childcare', startYm: '2026-09', endYm: '2026-11', benefitAmount: 0 },
        ],
      },
    });
    const result = applyScenarioOverride(base, { label: '早期復職', reinstatementMonth: 2 });
    expect(result.income.leavePeriods[0].endYm).toBe('2026-02');
    expect(result.income.leavePeriods[1]).toEqual({ type: 'childcare', startYm: '2026-09', endYm: '2026-11', benefitAmount: 0 });
  });

  it('reinstatementMonth: 配列の並び順ではなくstartYmの昇順で対象期間を選ぶ(実装後レビュー対応: LeavePeriodEditorは新規期間を末尾に追加するため、後から追加した期間が先に始まっている配列順もありうる)', () => {
    const base = makeProfile({
      income: {
        ...monthlyAllYearProfileIncome(),
        // 配列の先頭(index 0)は9月開始だが、1月開始の期間の方が時系列では先
        leavePeriods: [
          { type: 'childcare', startYm: '2026-09', endYm: '2026-11', benefitAmount: 0 },
          { type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 0 },
        ],
      },
    });
    const result = applyScenarioOverride(base, { label: '早期復職', reinstatementMonth: 2 });
    // 1月開始(startYmが早い方)が変更され、9月開始の期間は変更されない
    expect(result.income.leavePeriods[0]).toEqual({ type: 'childcare', startYm: '2026-09', endYm: '2026-11', benefitAmount: 0 });
    expect(result.income.leavePeriods[1].endYm).toBe('2026-02');
  });

  it('reinstatementMonth: 産休に続けて育休がある実際的なケースで、産休月を平均から除外して見込み給与を計算する(実装後レビュー対応: 産休月(0円)を平均に含めると見込み給与が半分になっていた)', () => {
    const base = makeProfile({
      income: {
        monthly: [
          ...Array.from({ length: 3 }, (_, i) => ({ month: i + 1, status: 'actual' as const, grossSalary: 0, socialInsurance: 0, isSocialInsuranceExempt: true })), // 産休(1-3月)
          ...Array.from({ length: 6 }, (_, i) => ({ month: i + 4, status: 'actual' as const, grossSalary: 0, socialInsurance: 0, isSocialInsuranceExempt: true })), // 育休(4-9月)
          ...Array.from({ length: 3 }, (_, i) => ({ month: i + 10, status: 'estimated' as const, grossSalary: 600_000, socialInsurance: 80_000, isSocialInsuranceExempt: false })), // 就労(10-12月)
        ],
        bonuses: [],
        leavePeriods: [
          { type: 'maternity', startYm: '2026-01', endYm: '2026-03', benefitAmount: 0 },
          { type: 'childcare', startYm: '2026-04', endYm: '2026-09', benefitAmount: 300_000 },
        ],
        otherSalaryIncome: 0,
      },
    });
    const result = applyScenarioOverride(base, { label: '早期復職', reinstatementMonth: 6 });
    // 7〜9月が新たに就労月になる。産休月(0円)を平均に含めず、就労月(10〜12月、600,000/80,000)のみで平均するべき
    const month7 = result.income.monthly.find((m) => m.month === 7)!;
    expect(month7.grossSalary).toBe(600_000);
    expect(month7.socialInsurance).toBe(80_000);
    // 産休月(1〜3月)は引き続き0円のまま(このシナリオの対象は育休であり、産休期間は変更しない)
    const month2 = result.income.monthly.find((m) => m.month === 2)!;
    expect(month2.grossSalary).toBe(0);
  });

  it('reinstatementMonth: 解放される月にすでに0円以外の給与が記録されている場合は上書きしない(実装後レビュー対応: 育休追加前に埋めていた実データを平均値で消さない)', () => {
    const base = makeProfile({
      income: {
        monthly: [
          { month: 1, status: 'actual' as const, grossSalary: 500_000, socialInsurance: 70_000, isSocialInsuranceExempt: false },
          { month: 2, status: 'estimated' as const, grossSalary: 500_000, socialInsurance: 70_000, isSocialInsuranceExempt: false }, // 育休追加前に見込みを埋めていた月
          { month: 3, status: 'estimated' as const, grossSalary: 500_000, socialInsurance: 70_000, isSocialInsuranceExempt: false },
          ...Array.from({ length: 9 }, (_, i) => ({ month: i + 4, status: 'estimated' as const, grossSalary: 300_000, socialInsurance: 40_000, isSocialInsuranceExempt: false })),
        ],
        bonuses: [],
        leavePeriods: [{ type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 0 }],
        otherSalaryIncome: 0,
      },
    });
    const result = applyScenarioOverride(base, { label: '早期復職', reinstatementMonth: 1 });
    // 2月・3月は育休対象から外れるが、すでに記録されている500,000円を保持する(平均値300,000円で上書きしない)
    const month2 = result.income.monthly.find((m) => m.month === 2)!;
    expect(month2.grossSalary).toBe(500_000);
    expect(month2.socialInsurance).toBe(70_000);
  });

  it('reinstatementMonth: 指定月が育休開始より前の場合、開始年月にクランプし範囲の反転(消滅)を防ぐ', () => {
    const base = makeProfile({
      income: {
        ...monthlyAllYearProfileIncome(),
        leavePeriods: [{ type: 'childcare', startYm: '2026-06', endYm: '2026-09', benefitAmount: 0 }],
      },
    });
    const result = applyScenarioOverride(base, { label: '極端に早い復職', reinstatementMonth: 3 });
    expect(result.income.leavePeriods[0].endYm).toBe('2026-06');
  });

  it('reinstatementMonth: 育休から新たに外れる月には非育休月の平均給与を見込みとして補う(実装後レビュー対応)', () => {
    // MonthlyIncomeGridは育休対象月の入力を無効化し常に0円にするため、実際のプロファイルでは
    // 育休対象月のgrossSalaryは0円になる。何もしないと復職月を早めても給与が増えないままになる。
    const base = makeProfile({
      income: {
        monthly: [
          ...Array.from({ length: 8 }, (_, i) => ({ month: i + 1, status: 'actual' as const, grossSalary: 0, socialInsurance: 0, isSocialInsuranceExempt: true })),
          ...Array.from({ length: 4 }, (_, i) => ({ month: i + 9, status: 'estimated' as const, grossSalary: 400_000, socialInsurance: 55_000, isSocialInsuranceExempt: false })),
        ],
        bonuses: [],
        leavePeriods: [{ type: 'childcare', startYm: '2026-01', endYm: '2026-08', benefitAmount: 300_000 }],
        otherSalaryIncome: 0,
      },
    });
    const result = applyScenarioOverride(base, { label: '早期復職', reinstatementMonth: 4 });
    // 5〜8月は新たに育休対象外になるため、非育休月(9〜12月、平均400,000/55,000)の見込みで補われる
    const month5 = result.income.monthly.find((m) => m.month === 5)!;
    expect(month5.grossSalary).toBe(400_000);
    expect(month5.socialInsurance).toBe(55_000);
    expect(month5.isSocialInsuranceExempt).toBe(false);
    expect(month5.status).toBe('estimated');
    // 1〜3月は引き続き育休対象のまま(0円)
    const month2 = result.income.monthly.find((m) => m.month === 2)!;
    expect(month2.grossSalary).toBe(0);
  });

  it('bonusMultiplier: 各賞与のgross・socialInsuranceに乗算し円未満を切り捨てる', () => {
    const base = makeProfile({
      income: {
        ...monthlyAllYearProfileIncome(),
        bonuses: [{ label: '夏季賞与', month: 6, status: 'estimated', gross: 500_001, socialInsurance: 70_003, isExempt: false }],
      },
    });
    const result = applyScenarioOverride(base, { label: '減額シナリオ', bonusMultiplier: 0.5 });
    expect(result.income.bonuses).toEqual([
      { label: '夏季賞与', month: 6, status: 'estimated', gross: 250_000, socialInsurance: 35_001, isExempt: false },
    ]);
  });

  it('additionalMedicalExpense: 医療費(支払額)に加算し、他の医療費フィールドは変更しない', () => {
    const base = makeProfile({
      deductions: { ...makeProfile().deductions, medical: { paid: 50_000, reimbursed: 10_000, selfMedication: 0, mode: 'auto' } },
    });
    const result = applyScenarioOverride(base, { label: '追加医療費', additionalMedicalExpense: 30_000 as Yen });
    expect(result.deductions.medical).toEqual({ paid: 80_000, reimbursed: 10_000, selfMedication: 0, mode: 'auto' });
  });

  it('donationAmountOverride: furusato.donatedAmountを上書きする', () => {
    const base = makeProfile({ furusato: { method: 'oneStop', donatedAmount: 10_000, safetyRatio: 0.9 } });
    const result = applyScenarioOverride(base, { label: '寄附額変更', donationAmountOverride: 50_000 as Yen });
    expect(result.furusato).toEqual({ method: 'oneStop', donatedAmount: 50_000, safetyRatio: 0.9 });
  });

  it('複数のoverrideを同時に適用できる', () => {
    const base = makeProfile({
      income: {
        ...monthlyAllYearProfileIncome(),
        leavePeriods: [{ type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 0 }],
      },
    });
    const result = applyScenarioOverride(base, {
      label: '複合シナリオ',
      reinstatementMonth: 2,
      additionalMedicalExpense: 10_000 as Yen,
      donationAmountOverride: 20_000 as Yen,
    });
    expect(result.income.leavePeriods[0].endYm).toBe('2026-02');
    expect(result.deductions.medical.paid).toBe(10_000);
    expect(result.furusato.donatedAmount).toBe(20_000);
  });
});

describe('runScenario', () => {
  it('overrideを適用した結果でCalculationResultを計算する(復職が早いほど給与所得が増える)', () => {
    const base = makeProfile({
      income: {
        monthly: monthlyAllYear(400_000, 55_000),
        bonuses: [],
        leavePeriods: [{ type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 300_000 }],
        otherSalaryIncome: 0,
      },
    });
    const earlyReturn = runScenario(base, { label: '2月復職', reinstatementMonth: 2 }, TAX_PARAMS_2026);
    const lateReturn = runScenario(base, { label: '4月復職', reinstatementMonth: 4 }, TAX_PARAMS_2026);
    // 復職が早い(育休が短い)ほど就労月が増え、給与所得が高くなる
    expect(earlyReturn.income.salaryIncome).toBeGreaterThan(lateReturn.income.salaryIncome);
  });

  it('育休対象月が実際のUIどおり0円で記録されているプロファイルでも、復職を早めると給与所得が増える(実装後レビュー対応: 核心ユースケースの検証)', () => {
    // MonthlyIncomeGridの実際の挙動どおり、育休対象月(1〜8月)はgrossSalary=0で記録されている
    const base = makeProfile({
      income: {
        monthly: [
          ...Array.from({ length: 8 }, (_, i) => ({ month: i + 1, status: 'actual' as const, grossSalary: 0, socialInsurance: 0, isSocialInsuranceExempt: true })),
          ...Array.from({ length: 4 }, (_, i) => ({ month: i + 9, status: 'estimated' as const, grossSalary: 400_000, socialInsurance: 55_000, isSocialInsuranceExempt: false })),
        ],
        bonuses: [],
        leavePeriods: [{ type: 'childcare', startYm: '2026-01', endYm: '2026-08', benefitAmount: 300_000 }],
        otherSalaryIncome: 0,
      },
    });
    const baseResult = buildCalculationResult(base, TAX_PARAMS_2026);
    const earlyReturn = runScenario(base, { label: '5月復職', reinstatementMonth: 4 }, TAX_PARAMS_2026);
    expect(earlyReturn.income.salaryIncome).toBeGreaterThan(baseResult.income.salaryIncome);
  });
});

describe('compareScenarios', () => {
  it('各シナリオのlabel・limitAmount・diffFromBaseを正しく算出する', () => {
    const base = makeProfile({ income: monthlyAllYearProfileIncome() });
    const baseResult = buildCalculationResult(base, TAX_PARAMS_2026);

    const scenarioA = { label: 'シナリオA', additionalMedicalExpense: 100_000 as Yen };
    const scenarioB = { label: 'シナリオB', bonusMultiplier: 0 };
    const variants = [
      { override: scenarioA, result: runScenario(base, scenarioA, TAX_PARAMS_2026) },
      { override: scenarioB, result: runScenario(base, scenarioB, TAX_PARAMS_2026) },
    ];

    const rows = compareScenarios(baseResult, variants);
    expect(rows).toHaveLength(2);
    expect(rows[0].label).toBe('シナリオA');
    expect(rows[0].diffFromBase).toBe(rows[0].limitAmount - baseResult.furusato.limitAmount);
    expect(rows[1].label).toBe('シナリオB');
    expect(rows[1].diffFromBase).toBe(rows[1].limitAmount - baseResult.furusato.limitAmount);
  });
});

function monthlyAllYearProfileIncome() {
  return { monthly: monthlyAllYear(500_000, 70_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 };
}
