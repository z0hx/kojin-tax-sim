import { describe, expect, it } from 'vitest';
import { calcSnapshot } from '../engine';
import type { Yen } from '../types';
import { TAX_PARAMS_2026, emptyIncome, makeM1Profile, makeProfile } from './testHelpers';

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
    expect(snap.residentTax.furusatoCreditSpecial).toBe(Math.floor(233_288 * 0.2));
    expect(snap.residentTax.furusatoCreditBasic).toBe(19_800);
  });

  it('寄附20万円: 住民税確定額が69,300円、自己負担133,600円相当になる', () => {
    const zero = calcSnapshot(profile, 0 as Yen, TAX_PARAMS_2026, 'standard');
    const withD = calcSnapshot(profile, 200_000 as Yen, TAX_PARAMS_2026, 'standard');
    expect(withD.residentTax.incomeLevyFinal).toBe(69_300);
    expect(withD.residentTax.total).toBe(75_200);

    const incomeTaxReduction = zero.incomeTax.total - withD.incomeTax.total;
    const residentReduction = zero.residentTax.total - withD.residentTax.total;
    const selfBurden = 200_000 - (incomeTaxReduction + residentReduction);
    expect(incomeTaxReduction).toBe(0);
    expect(residentReduction).toBe(66_400);
    expect(selfBurden).toBe(133_600);
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
