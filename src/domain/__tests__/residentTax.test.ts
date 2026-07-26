import { describe, expect, it } from 'vitest';
import {
  calcAdjustmentCredit,
  calcFurusatoBasicCredit,
  calcFurusatoSpecialCredit,
  calcIncomeLevy,
  calcIncomeLevyBeforeAdjustment,
  calcIncomeLevyFinal,
  calcPerCapitaLevy,
} from '../residentTax';
import type { Yen } from '../types';
import { yokohamaMunicipality } from './testHelpers';

const CUTOFF = 25_000_000;
const BELOW_CUTOFF_INCOME = 5_000_000 as Yen;

describe('calcAdjustmentCredit (T-14 調整控除の境界)', () => {
  it('課税総所得金額2,000,000円ちょうど: min(D,課税総所得)×5%', () => {
    expect(calcAdjustmentCredit(2_000_000 as Yen, 50_000 as Yen, 2500, BELOW_CUTOFF_INCOME, CUTOFF)).toBe(50_000 * 0.05);
  });

  it('課税総所得金額2,000,001円: 別の式に切り替わる', () => {
    // D=1,000,000のように大きい場合、境界の前後で式の値そのものが変わることを確認する
    const atBoundary = calcAdjustmentCredit(2_000_000 as Yen, 1_000_000 as Yen, 2500, BELOW_CUTOFF_INCOME, CUTOFF);
    const justAbove = calcAdjustmentCredit(2_000_001 as Yen, 1_000_000 as Yen, 2500, BELOW_CUTOFF_INCOME, CUTOFF);
    expect(atBoundary).toBe(Math.min(1_000_000, 2_000_000) * 0.05);
    // (1,000,000 - 1) × 5% = 49,999.95 → floor
    expect(justAbove).toBe(Math.floor((1_000_000 - 1) * 0.05));
    expect(justAbove).toBeLessThan(atBoundary);
  });

  it('計算結果が最低額を下回る場合は最低額2,500円が適用される', () => {
    expect(calcAdjustmentCredit(5_000_000 as Yen, 20_000 as Yen, 2500, BELOW_CUTOFF_INCOME, CUTOFF)).toBe(2500);
  });

  it('M1モデルケース: D=50,000, 課税総所得2,352,000円 → 2,500円(最低額)', () => {
    expect(calcAdjustmentCredit(2_352_000 as Yen, 50_000 as Yen, 2500, BELOW_CUTOFF_INCOME, CUTOFF)).toBe(2500);
  });

  it('合計所得金額が2,500万円を超えると調整控除は0円になる(02仕様書§3.3.1、レビュー2巡目Medium#3是正)', () => {
    const result = calcAdjustmentCredit(2_000_000 as Yen, 50_000 as Yen, 2500, 25_000_001 as Yen, CUTOFF);
    expect(result).toBe(0);
  });

  it('合計所得金額がちょうど2,500万円なら通常どおり適用される', () => {
    const result = calcAdjustmentCredit(2_000_000 as Yen, 50_000 as Yen, 2500, 25_000_000 as Yen, CUTOFF);
    expect(result).toBe(50_000 * 0.05);
  });
});

describe('calcIncomeLevyBeforeAdjustment / calcIncomeLevy', () => {
  it('M1モデルケース: 2,352,000×10.025%=235,788円', () => {
    const before = calcIncomeLevyBeforeAdjustment(2_352_000 as Yen, 0.06, 0.04025);
    expect(before).toBe(235_788);
    expect(calcIncomeLevy(before, 2500 as Yen)).toBe(233_288);
  });
});

describe('calcFurusatoBasicCredit', () => {
  it('(対象寄附額-2,000)×10%', () => {
    expect(calcFurusatoBasicCredit(200_000 as Yen, 3_560_000 as Yen, 0.1, 0.3)).toBe(19_800);
  });
  it('総所得金額等の30%が上限', () => {
    // 対象寄附額 = min(5,000,000, 3,560,000×30%=1,068,000) = 1,068,000
    expect(calcFurusatoBasicCredit(5_000_000 as Yen, 3_560_000 as Yen, 0.1, 0.3)).toBe(Math.floor((1_068_000 - 2000) * 0.1));
  });
});

describe('calcFurusatoSpecialCredit (T-11 20%枠到達)', () => {
  it('M1モデルケース: 寄附20万円で20%枠に到達する', () => {
    const result = calcFurusatoSpecialCredit(200_000 as Yen, 3_560_000 as Yen, 0.05, 233_288 as Yen, 0.3, 0.2, 0.021);
    expect(result.capReached).toBe(true);
    expect(result.capped).toBe(Math.floor(233_288 * 0.2));
  });
  it('少額の寄附では20%枠に到達しない', () => {
    const result = calcFurusatoSpecialCredit(10_000 as Yen, 3_560_000 as Yen, 0.05, 233_288 as Yen, 0.3, 0.2, 0.021);
    expect(result.capReached).toBe(false);
    expect(result.capped).toBe(result.raw);
  });
});

describe('calcIncomeLevyFinal (T-16 端数処理)', () => {
  it('100円未満を切り捨てる', () => {
    expect(calcIncomeLevyFinal(233_288 as Yen, 97_500 as Yen)).toBe(135_700);
  });
});

describe('calcPerCapitaLevy', () => {
  it('市町村+道府県+森林環境税の合算', () => {
    expect(calcPerCapitaLevy(yokohamaMunicipality())).toBe(3900 + 1000 + 1000);
  });
});
