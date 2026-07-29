import { describe, expect, it } from 'vitest';
import { calcSnapshot } from '../engine';
import { findFurusatoLimit } from '../furusato';
import type { Yen } from '../types';
import { TAX_PARAMS_2026, emptyIncome, makeM1Profile, makeProfile, monthlyAllYear, yokohamaMunicipality } from './testHelpers';

function profileWithOtherIncome(otherSalaryIncome: number) {
  return makeProfile({ income: { ...emptyIncome(), otherSalaryIncome } });
}

describe('calcSnapshot: M1モデルケース (03詳細設計書§10.2)', () => {
  const profile = makeM1Profile(32_000_000);

  it('寄附なし: 差引所得税額が0円になる(T-05, W-01相当)', () => {
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.salaryIncome).toBe(3_560_000);
    expect(snap.incomeTax.taxableIncome).toBe(1_730_000);
    expect(snap.incomeTax.calculatedTax).toBe(86_500);
    expect(snap.incomeTax.taxAfterCredits).toBe(0);
    expect(snap.incomeTax.reconstructionTax).toBe(0);
  });

  it('寄附なし: 住宅ローン控除の切り捨て損失が40,000円発生する(T-06, W-02相当)', () => {
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.housingLoan.creditAvailable).toBe(224_000);
    expect(snap.housingLoan.usedInIncomeTax).toBe(86_500);
    expect(snap.housingLoan.carriedToResidentTax).toBe(137_500);
    expect(snap.housingLoan.residentTaxCap).toBe(97_500);
    expect(snap.housingLoan.wasted).toBe(40_000);
  });

  it('寄附なし: 住民税所得割額が233,288円、最終135,700円になる', () => {
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.residentTax.incomeLevyBeforeAdj).toBe(235_788);
    expect(snap.residentTax.adjustmentCredit).toBe(2_500);
    expect(snap.residentTax.incomeLevy).toBe(233_288);
    // 20%枠の基準は超過課税分(道府県0.025%)を含めない標準税率10%で算出する(02仕様書§2.2)
    expect(snap.residentTax.incomeLevyForFurusatoCap).toBe(232_700);
    expect(snap.residentTax.incomeLevyFinal).toBe(135_700);
    expect(snap.residentTax.perCapitaLevy).toBe(5_900);
    expect(snap.residentTax.total).toBe(141_600);
  });

  it('寄附20万円: 所得税は変わらず0円のまま(住宅ローン控除で既に相殺済み)', () => {
    const snap = calcSnapshot(profile, 200_000 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.incomeTax.taxableIncome).toBe(1_532_000);
    expect(snap.incomeTax.calculatedTax).toBe(76_600);
    expect(snap.incomeTax.taxAfterCredits).toBe(0);
  });

  it('寄附20万円: 切り捨て損失が49,900円に増加する(T-07, W-03相当)', () => {
    const snap = calcSnapshot(profile, 200_000 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.housingLoan.carriedToResidentTax).toBe(147_400);
    expect(snap.housingLoan.wasted).toBe(49_900);
  });

  it('寄附20万円: 特例分が20%枠に到達する(T-11)', () => {
    const snap = calcSnapshot(profile, 200_000 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.furusato.specialCapReached).toBe(true);
    expect(snap.residentTax.furusatoCreditSpecial).toBe(Math.floor(232_700 * 0.2));
    expect(snap.residentTax.furusatoCreditBasic).toBe(19_800);
  });

  it('寄附20万円: 住民税確定額が69,400円、自己負担133,700円相当になる', () => {
    const zero = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    const withD = calcSnapshot(profile, 200_000 as Yen, TAX_PARAMS_2026, 'standard');
    expect(withD.residentTax.incomeLevyFinal).toBe(69_400);
    expect(withD.residentTax.total).toBe(75_300);

    const incomeTaxReduction = zero.incomeTax.total - withD.incomeTax.total;
    const residentReduction = zero.residentTax.total - withD.residentTax.total;
    const selfBurden = 200_000 - (incomeTaxReduction + residentReduction);
    expect(incomeTaxReduction).toBe(0);
    expect(residentReduction).toBe(66_300);
    expect(selfBurden).toBe(133_700);
  });
});

describe('calcSnapshot: 所得割非課税ケース (T-12)', () => {
  it('所得が低い場合、所得割額が0円になる', () => {
    const profile = makeProfile();
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.residentTax.incomeLevy).toBe(0);
  });
});

describe('calcSnapshot: conservativeモード (§4.3 R-03)', () => {
  it('conservativeモードは住宅ローン控除適用後の所得割額を20%枠の基準にする', () => {
    const profile = makeM1Profile(32_000_000);
    const standard = calcSnapshot(profile, 200_000 as Yen, TAX_PARAMS_2026, 'standard');
    const conservative = calcSnapshot(profile, 200_000 as Yen, TAX_PARAMS_2026, 'conservative');
    // conservativeは基準となる所得割額が住宅ローン控除分だけ小さくなるため、特例分の上限も小さくなるか同じになる
    expect(conservative.residentTax.furusatoCreditSpecial).toBeLessThanOrEqual(standard.residentTax.furusatoCreditSpecial);
  });
});

describe('calcSnapshot: 特例分20%枠の基準税率 (useStandardRateForFurusato, 02仕様書§2.2)', () => {
  // 横浜市(神奈川県)は道府県民税所得割が4.025%。標準税率10%との差が枠の判定に出るケース。
  const income = { monthly: monthlyAllYear(500_000, 75_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 };

  it('trueのとき、20%枠の基準は標準税率10%の所得割額になり、実効税率の所得割額より小さくなる', () => {
    const profile = makeProfile({ income });
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');

    const taxable = snap.residentTax.taxableIncome;
    expect(snap.residentTax.incomeLevyBeforeAdj).toBe(Math.floor(taxable * 0.10025));
    expect(snap.residentTax.incomeLevyForFurusatoCap).toBe(Math.floor(taxable * 0.1) - snap.residentTax.adjustmentCredit);
    expect(snap.residentTax.incomeLevyForFurusatoCap).toBeLessThan(snap.residentTax.incomeLevy);
  });

  it('falseのとき、20%枠の基準は自治体の実効税率で算出した所得割額と一致する', () => {
    const profile = makeProfile({
      income,
      municipality: { ...yokohamaMunicipality(), useStandardRateForFurusato: false },
    });
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.residentTax.incomeLevyForFurusatoCap).toBe(snap.residentTax.incomeLevy);
  });

  it('超過課税を枠の基準に含めないぶん、上限額は含めた場合より小さくなる(過大算出の回帰防止)', () => {
    // 税率差は0.025%(枠の基準で0.25%相当)しかないため、1,000円刻みの探索で差が出る
    // 高所得ケースを使う。低所得帯では丸めに吸収されて上限額が同額になることもある。
    const highIncome = { monthly: monthlyAllYear(2_500_000, 200_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 };
    const withStandardRate = findFurusatoLimit(makeProfile({ income: highIncome }), TAX_PARAMS_2026, 'standard');
    const withActualRate = findFurusatoLimit(
      makeProfile({ income: highIncome, municipality: { ...yokohamaMunicipality(), useStandardRateForFurusato: false } }),
      TAX_PARAMS_2026,
      'standard'
    );
    expect(withStandardRate.limit).toBeLessThan(withActualRate.limit);
    // 簡易計算式(approxByFormula)も同じ基準を使うため、同様に小さくなる
    expect(withStandardRate.approxByFormula).toBeLessThan(withActualRate.approxByFormula);
  });

  it('標準税率の自治体では、trueでもfalseでも上限額が変わらない', () => {
    const standardRateMunicipality = { ...yokohamaMunicipality(), prefecturalIncomeRate: 0.04 };
    const on = findFurusatoLimit(makeProfile({ income, municipality: standardRateMunicipality }), TAX_PARAMS_2026, 'standard');
    const off = findFurusatoLimit(
      makeProfile({ income, municipality: { ...standardRateMunicipality, useStandardRateForFurusato: false } }),
      TAX_PARAMS_2026,
      'standard'
    );
    expect(on.limit).toBe(off.limit);
  });
});

describe('calcSnapshot: 住民税の非課税限度額 (レビュー指摘Medium#4是正)', () => {
  it('合計所得金額が非課税限度額(45万円)以下なら所得割・均等割とも0円になる', () => {
    // gross=1,000,000円 → 給与所得控除(2026年分, 220万円以下なので74万円) → 合計所得金額26万円
    const profile = profileWithOtherIncome(1_000_000);
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.totalIncome).toBeLessThanOrEqual(450_000);
    expect(snap.residentTax.incomeLevy).toBe(0);
    expect(snap.residentTax.perCapitaLevy).toBe(0);
    expect(snap.residentTax.total).toBe(0);
  });

  it('非課税限度額をわずかに超える場合は通常どおり均等割が課税される', () => {
    // gross=1,300,000円 → 給与所得控除74万円 → 合計所得金額56万円(非課税限度額45万円を超える)
    const profile = profileWithOtherIncome(1_300_000);
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.totalIncome).toBeGreaterThan(450_000);
    expect(snap.residentTax.perCapitaLevy).toBeGreaterThan(0);
  });
});

describe('calcSnapshot: 住民税基礎控除の高所得者向け逓減 (レビュー指摘Medium#5是正)', () => {
  it('合計所得金額2,400万円超では基礎控除が29万円に下がる', () => {
    // gross=30,000,000円 → 給与所得控除は上限1,950,000円で頭打ち → 合計所得金額28,050,000円
    const profile = profileWithOtherIncome(30_000_000);
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.totalIncome).toBeGreaterThan(24_000_000);
    expect(snap.residentTax.deductions.basic).toBeLessThanOrEqual(290_000);
  });
});

function profileWithOtherIncomeAndDependent(otherSalaryIncome: number) {
  return makeProfile({
    income: { ...emptyIncome(), otherSalaryIncome },
    deductions: {
      ...makeProfile().deductions,
      dependents: [{ id: 'c1', age: 10 }],
    },
  });
}

describe('calcSnapshot: 扶養親族がいる場合の非課税限度額 (レビュー2巡目High#1是正)', () => {
  it('扶養1人・合計所得96万円: 均等割・所得割とも非課税(いずれの基準額も下回る)', () => {
    // gross=1,700,000円 → 給与所得控除74万円(2026年分・220万円以下の時限措置) → 合計所得金額96万円
    const profile = profileWithOtherIncomeAndDependent(1_700_000);
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.totalIncome).toBe(960_000);
    expect(snap.residentTax.incomeLevy).toBe(0);
    expect(snap.residentTax.perCapitaLevy).toBe(0);
  });

  it('扶養1人・合計所得105万円: 均等割は課税されるが所得割は非課税の帯域になる', () => {
    // gross=1,790,000円 → 給与所得控除74万円 → 合計所得金額105万円
    // 均等割の非課税限度額(101万円)は超えるが、所得割の非課税限度額(112万円)は超えない
    const profile = profileWithOtherIncomeAndDependent(1_790_000);
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.totalIncome).toBe(1_050_000);
    expect(snap.residentTax.incomeLevy).toBe(0);
    expect(snap.residentTax.perCapitaLevy).toBeGreaterThan(0);
  });

  it('扶養1人・合計所得126万円: 均等割・所得割とも課税される(いずれの基準額も上回る)', () => {
    // gross=2,000,000円 → 給与所得控除74万円 → 合計所得金額126万円
    const profile = profileWithOtherIncomeAndDependent(2_000_000);
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.totalIncome).toBe(1_260_000);
    expect(snap.residentTax.incomeLevy).toBeGreaterThan(0);
    expect(snap.residentTax.perCapitaLevy).toBeGreaterThan(0);
  });
});

describe('calcSnapshot: 同一生計配偶者がいる場合の非課税限度額 (レビュー3巡目High是正)', () => {
  it('扶養親族はいないが低所得の配偶者がいる場合、頭数2人分の基準額が適用される', () => {
    // gross=1,650,000円 → 給与所得控除74万円 → 合計所得金額91万円。
    // 配偶者(合計所得0円、同一生計配偶者に該当)を頭数に含めると、
    // 均等割基準(101万円)・所得割基準(112万円)のどちらも下回り非課税になる。
    // 配偶者を頭数に含めない(修正前の)ロジックだと基準額は45万円のみとなり課税されてしまっていた。
    const profile = makeProfile({
      income: { ...emptyIncome(), otherSalaryIncome: 1_650_000 },
      deductions: { ...makeProfile().deductions, spouse: { totalIncome: 0 } },
    });
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.totalIncome).toBe(910_000);
    expect(snap.residentTax.incomeLevy).toBe(0);
    expect(snap.residentTax.perCapitaLevy).toBe(0);
    expect(snap.residentTax.total).toBe(0);
  });

  it('配偶者の合計所得が48万円を超える場合は同一生計配偶者に該当せず、頭数に含まれない', () => {
    const profile = makeProfile({
      income: { ...emptyIncome(), otherSalaryIncome: 1_650_000 },
      deductions: { ...makeProfile().deductions, spouse: { totalIncome: 900_000 } },
    });
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    expect(snap.income.totalIncome).toBe(910_000);
    // 頭数0人扱いのため基準額は45万円のまま → 91万円は非課税限度額を超える
    expect(snap.residentTax.perCapitaLevy).toBeGreaterThan(0);
  });
});

describe('calcSnapshot: trace(Issue #10 S-05計算明細画面向けの計算式・根拠メタデータ)', () => {
  it('主要なステップにformula(計算式)とrefs(根拠)が付与されている', () => {
    const profile = makeM1Profile(32_000_000);
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    const byKey = (key: string) => snap.trace.find((t) => t.key === key);

    for (const key of [
      'salaryDeduction',
      'salaryIncome',
      'taxableIncome',
      'marginalRate',
      'calculatedTax',
      'housingLoanCreditAvailable',
      'taxAfterCredits',
      'reconstructionTax',
      'incomeLevyBeforeAdj',
      'adjustmentCredit',
      'incomeLevy',
      'incomeLevyForFurusatoCap',
      'housingLoanResidentCap',
      'housingLoanWasted',
      'incomeLevyFinal',
      'perCapitaLevy',
    ]) {
      const step = byKey(key);
      expect(step, `trace step "${key}" が見つからない`).toBeDefined();
      expect(step!.formula, `trace step "${key}" にformulaが無い`).toBeTruthy();
      expect(step!.refs?.length, `trace step "${key}" にrefsが無い`).toBeGreaterThan(0);
    }
  });

  it('trace配列の順序は計算の流れ(所得→所得税→住民税)を保つ', () => {
    const profile = makeM1Profile(32_000_000);
    const snap = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    const keys = snap.trace.map((t) => t.key);
    expect(keys.indexOf('grossTotal')).toBeLessThan(keys.indexOf('taxableIncome'));
    expect(keys.indexOf('taxableIncome')).toBeLessThan(keys.indexOf('calculatedTax'));
    expect(keys.indexOf('calculatedTax')).toBeLessThan(keys.indexOf('taxableResident'));
    expect(keys.indexOf('taxableResident')).toBeLessThan(keys.indexOf('incomeLevyFinal'));
  });
});
