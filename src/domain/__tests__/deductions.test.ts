import { describe, expect, it } from 'vitest';
import {
  calcDependentDeduction,
  calcEarthquakeInsuranceDeduction,
  calcLifeInsuranceDeduction,
  calcMedicalDeduction,
  calcSpouseDeduction,
  lookupBasicDeduction,
} from '../deductions';
import type { Yen } from '../types';
import { TAX_PARAMS_2025, TAX_PARAMS_2026 } from './testHelpers';

describe('lookupBasicDeduction (T-03 基礎控除の境界値)', () => {
  it('2025年分: 合計所得4,890,000円ちょうど', () => {
    expect(lookupBasicDeduction(4_890_000 as Yen, TAX_PARAMS_2025.incomeTax.basicDeduction)).toBe(680_000);
  });
  it('2025年分: 合計所得6,550,000円ちょうど', () => {
    expect(lookupBasicDeduction(6_550_000 as Yen, TAX_PARAMS_2025.incomeTax.basicDeduction)).toBe(630_000);
  });
  it('2025年分: 合計所得23,500,000円ちょうど', () => {
    expect(lookupBasicDeduction(23_500_000 as Yen, TAX_PARAMS_2025.incomeTax.basicDeduction)).toBe(580_000);
  });
  it('2026年分: 合計所得4,890,000円以下は改正により104万円', () => {
    expect(lookupBasicDeduction(4_890_000 as Yen, TAX_PARAMS_2026.incomeTax.basicDeduction)).toBe(1_040_000);
  });
  it('2026年分: 合計所得6,550,000円ちょうどは67万円', () => {
    expect(lookupBasicDeduction(6_550_000 as Yen, TAX_PARAMS_2026.incomeTax.basicDeduction)).toBe(670_000);
  });
});

describe('calcLifeInsuranceDeduction (T-13 新旧併用)', () => {
  it('新制度・一般50,000円 + 旧制度・一般60,000円の併用(所得税)', () => {
    const result = calcLifeInsuranceDeduction(
      { new: { general: 50_000, nursing: 0, pension: 0 }, old: { general: 60_000, pension: 0 }, hasChildUnder23: false },
      TAX_PARAMS_2025.incomeTax.lifeInsurance
    );
    // 新のみ: 50,000×1/2+10,000=35,000 / 旧のみ: 60,000×1/4+12,500=27,500 / 新+旧はmin(35000+27500,40000)=40000
    // max(35000, 27500, 40000) = 40000
    expect(result).toBe(40_000);
  });

  it('新制度のみ80,000円(上限一杯)なら区分上限の40,000円', () => {
    const result = calcLifeInsuranceDeduction(
      { new: { general: 80_000, nursing: 0, pension: 0 }, old: { general: 0, pension: 0 }, hasChildUnder23: false },
      TAX_PARAMS_2025.incomeTax.lifeInsurance
    );
    expect(result).toBe(40_000);
  });

  it('3区分すべて上限まで払うと合計上限120,000円が効く(所得税)', () => {
    const result = calcLifeInsuranceDeduction(
      { new: { general: 80_000, nursing: 80_000, pension: 80_000 }, old: { general: 0, pension: 0 }, hasChildUnder23: false },
      TAX_PARAMS_2025.incomeTax.lifeInsurance
    );
    expect(result).toBe(120_000);
  });

  it('住民税は区分ごと28,000円・合計70,000円が上限', () => {
    const result = calcLifeInsuranceDeduction(
      { new: { general: 80_000, nursing: 80_000, pension: 80_000 }, old: { general: 0, pension: 0 }, hasChildUnder23: false },
      TAX_PARAMS_2025.residentTax.lifeInsurance
    );
    expect(result).toBe(70_000);
  });

  it('2026年分: 子育て世帯特例で一般区分の上限が60,000円に拡充される(所得税のみ)', () => {
    // 80,000円ちょうどは通常区分の式(×1/4+20,000=40,000)と上限が一致する境界のため、
    // 拡充の効果を確認するには「80,001円〜」の定額区分に入る100,000円で検証する
    const result = calcLifeInsuranceDeduction(
      { new: { general: 100_000, nursing: 0, pension: 0 }, old: { general: 0, pension: 0 }, hasChildUnder23: true },
      TAX_PARAMS_2026.incomeTax.lifeInsurance
    );
    expect(result).toBe(60_000);
  });

  it('子育て世帯特例なしなら100,000円でも通常上限40,000円のまま', () => {
    const result = calcLifeInsuranceDeduction(
      { new: { general: 100_000, nursing: 0, pension: 0 }, old: { general: 0, pension: 0 }, hasChildUnder23: false },
      TAX_PARAMS_2026.incomeTax.lifeInsurance
    );
    expect(result).toBe(40_000);
  });
});

describe('calcEarthquakeInsuranceDeduction', () => {
  it('所得税: 支払額が上限以下ならそのまま全額', () => {
    const result = calcEarthquakeInsuranceDeduction({ long: 30_000, short: 0 }, TAX_PARAMS_2025.incomeTax.earthquakeInsurance);
    expect(result).toBe(30_000);
  });
  it('所得税: 上限50,000円を超えると頭打ち', () => {
    const result = calcEarthquakeInsuranceDeduction({ long: 80_000, short: 0 }, TAX_PARAMS_2025.incomeTax.earthquakeInsurance);
    expect(result).toBe(50_000);
  });
  it('住民税: 地震保険料は1/2で計算され上限25,000円', () => {
    const result = calcEarthquakeInsuranceDeduction({ long: 30_000, short: 0 }, TAX_PARAMS_2025.residentTax.earthquakeInsurance);
    expect(result).toBe(15_000);
  });
});

describe('calcMedicalDeduction (T-08 足切り額の切替)', () => {
  it('総所得200万円未満: 足切り額は総所得×5%が採用される', () => {
    const result = calcMedicalDeduction(
      { paid: 300_000, reimbursed: 20_000, selfMedication: 0, mode: 'medical' },
      1_800_000 as Yen,
      TAX_PARAMS_2026.incomeTax.medical
    );
    expect(result.thresholdBasis).toBe('incomeRatio5pct');
    expect(result.thresholdUsed).toBe(90_000);
    expect(result.amount).toBe(300_000 - 20_000 - 90_000);
  });

  it('総所得200万円以上: 足切り額は固定10万円が採用される', () => {
    const result = calcMedicalDeduction(
      { paid: 300_000, reimbursed: 20_000, selfMedication: 0, mode: 'medical' },
      3_000_000 as Yen,
      TAX_PARAMS_2026.incomeTax.medical
    );
    expect(result.thresholdBasis).toBe('fixed100000');
    expect(result.thresholdUsed).toBe(100_000);
    expect(result.amount).toBe(300_000 - 20_000 - 100_000);
  });

  it('mode:autoはセルフメディケーションと医療費控除の有利な方を選ぶ', () => {
    const result = calcMedicalDeduction(
      { paid: 50_000, reimbursed: 0, selfMedication: 100_000, mode: 'auto' },
      5_000_000 as Yen,
      TAX_PARAMS_2026.incomeTax.medical
    );
    // 医療費控除: max(0, 50,000-100,000)=0 / セルフメディケーション: min(100,000-12,000,88,000)=88,000
    expect(result.chosenMode).toBe('selfMedication');
    expect(result.amount).toBe(88_000);
  });

  it('補填金額が支払額を上回ることは想定しない(バリデーション層でエラーにする前提だが、ここでは負にならないことを確認)', () => {
    const result = calcMedicalDeduction(
      { paid: 10_000, reimbursed: 20_000, selfMedication: 0, mode: 'medical' },
      5_000_000 as Yen,
      TAX_PARAMS_2026.incomeTax.medical
    );
    expect(result.amount).toBe(0);
  });
});

describe('calcSpouseDeduction (レビュー指摘High#1是正: 逓減・本人所得の考慮)', () => {
  it('配偶者の合計所得48万円以下・納税者900万円以下: 満額(所得税38万円)', () => {
    const result = calcSpouseDeduction({ totalIncome: 400_000 }, 5_000_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction);
    expect(result).toBe(380_000);
  });

  it('配偶者パート年収110万円(合計所得55万円)は配偶者特別控除の区分になる(満額は付与しない)', () => {
    const result = calcSpouseDeduction({ totalIncome: 550_000 }, 5_000_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction);
    // spouseIncomeUpTo=950000の行(38万円)が適用される区分だが、48万円超のため配偶者控除ではなく配偶者特別控除
    expect(result).toBe(380_000);
    // 配偶者所得が133万円に近づくほど逓減することを別途確認する(1,240,000円はspouseIncomeUpTo=1,250,000の行=11万円)
    const higherSpouseIncome = calcSpouseDeduction({ totalIncome: 1_240_000 }, 5_000_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction);
    expect(higherSpouseIncome).toBe(110_000);
  });

  it('納税者本人の合計所得金額が900万円超950万円以下では2/3相当に逓減する(10,000円未満丸め)', () => {
    const result = calcSpouseDeduction({ totalIncome: 400_000 }, 9_200_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction);
    // 380,000 × 2/3 = 253,333.33... → 10,000円単位で最も近い額に丸めて250,000
    // (国税庁の公表額とは10,000円単位で異なりうる近似値であることに注意。要確認パラメータ)
    expect(result).toBe(250_000);
  });

  it('納税者本人の合計所得金額が950万円超1000万円以下では1/3に逓減する', () => {
    const result = calcSpouseDeduction({ totalIncome: 400_000 }, 9_800_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction);
    expect(result).toBe(130_000);
  });

  it('納税者本人の合計所得金額が1000万円超は0円', () => {
    const result = calcSpouseDeduction({ totalIncome: 400_000 }, 11_000_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction);
    expect(result).toBe(0);
  });

  it('配偶者の合計所得金額が133万円を超えると0円', () => {
    const result = calcSpouseDeduction({ totalIncome: 1_400_000 }, 5_000_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction);
    expect(result).toBe(0);
  });

  it('老人控除対象配偶者(70歳以上)は満額48万円', () => {
    const result = calcSpouseDeduction({ totalIncome: 400_000, isElderly: true }, 5_000_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction);
    expect(result).toBe(480_000);
  });

  it('配偶者が未設定なら0円', () => {
    expect(calcSpouseDeduction(undefined, 5_000_000 as Yen, TAX_PARAMS_2026.incomeTax.spouseDeduction)).toBe(0);
  });

  it('住民税は所得税より低い額になる(満額33万円)', () => {
    const result = calcSpouseDeduction({ totalIncome: 400_000 }, 5_000_000 as Yen, TAX_PARAMS_2026.residentTax.spouseDeduction);
    expect(result).toBe(330_000);
  });
});

describe('calcDependentDeduction (レビュー指摘High#2是正: 16歳未満を除外)', () => {
  it('16歳未満の扶養親族は控除額0円(児童手当に一本化されているため)', () => {
    const result = calcDependentDeduction([{ id: 'c1', age: 3 }], TAX_PARAMS_2026.incomeTax.humanDeductions);
    expect(result).toBe(0);
  });

  it('16歳ちょうどは一般の扶養控除の対象になる', () => {
    const result = calcDependentDeduction([{ id: 'c1', age: 16 }], TAX_PARAMS_2026.incomeTax.humanDeductions);
    expect(result).toBe(TAX_PARAMS_2026.incomeTax.humanDeductions.dependentGeneral);
  });

  it('15歳と19歳が混在する場合、15歳分は算入されない', () => {
    const result = calcDependentDeduction(
      [
        { id: 'c1', age: 15 },
        { id: 'c2', age: 20 },
      ],
      TAX_PARAMS_2026.incomeTax.humanDeductions
    );
    expect(result).toBe(TAX_PARAMS_2026.incomeTax.humanDeductions.dependentSpecific);
  });
});
