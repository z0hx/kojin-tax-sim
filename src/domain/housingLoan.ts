import type { HousingLoanCapRule } from '../taxParams/schema';
import { floorYen, type HousingLoanInput, type Yen } from './types';

/**
 * 住宅ローン控除可能額。控除は入居年から`years`年間のみ適用されるため、対象年(targetYear)が
 * 適用期間(moveInYear 〜 moveInYear+years-1)を過ぎている場合は0円にする(Low#10是正)。
 */
export function calcCreditAvailable(input: HousingLoanInput | undefined, targetYear: number): Yen {
  if (!input) return 0 as Yen;
  const lastEligibleYear = input.moveInYear + input.years - 1;
  if (targetYear < input.moveInYear || targetYear > lastEligibleYear) return 0 as Yen;
  return floorYen(Math.min(input.yearEndBalance, input.borrowingCap) * input.rate);
}

export function applyToIncomeTax(available: Yen, calculatedTax: Yen): { used: Yen; carried: Yen } {
  const used = Math.min(available, calculatedTax) as Yen;
  const carried = (available - used) as Yen;
  return { used, carried };
}

/**
 * 住民税繰越上限の内訳(比率ベースの額・定額上限・実際に適用される額・比率そのもの)。
 * S-04画面(Issue #8)で「上限 ￥97,500 / 課税総所得×5% = ￥XX,XXX」のように両方の値を
 * 並記するために比率ベースの額と比率(ratio)を公開する。
 *
 * 注意: ここで返す`applied`はincomeNonTaxable(住民税所得割が非課税限度額以下)による
 * ゼロ化(engine.ts)を考慮しない、この関数単体での機械的な計算結果である。UI側で「実際に
 * 適用された額」を表示する場合は、この`applied`ではなくCalculationResult.housingLoan.residentTaxCap
 * (engine.tsがincomeNonTaxableを反映した後の値)を使うこと(レビュー対応: 非課税ケースでの表示不整合是正)。
 */
export function calcResidentTaxCapDetail(
  taxableResident: Yen,
  rule: HousingLoanInput['residentTaxCapRule'] | undefined,
  rules: { rule5pct97500: HousingLoanCapRule; rule7pct136500: HousingLoanCapRule }
): { ratioBased: Yen; fixed: Yen; applied: Yen; ratio: number } {
  if (!rule) return { ratioBased: 0 as Yen, fixed: 0 as Yen, applied: 0 as Yen, ratio: 0 };
  const r = rules[rule];
  const ratioBased = floorYen(taxableResident * r.ratio);
  return { ratioBased, fixed: r.cap as Yen, applied: Math.min(ratioBased, r.cap) as Yen, ratio: r.ratio };
}

export function calcResidentTaxCap(
  taxableResident: Yen,
  rule: HousingLoanInput['residentTaxCapRule'] | undefined,
  rules: { rule5pct97500: HousingLoanCapRule; rule7pct136500: HousingLoanCapRule }
): Yen {
  return calcResidentTaxCapDetail(taxableResident, rule, rules).applied;
}

export function applyToResidentTax(carried: Yen, cap: Yen, availableLevy: Yen): { used: Yen; wasted: Yen } {
  const used = Math.min(carried, cap, availableLevy) as Yen;
  const wasted = (carried - used) as Yen;
  return { used, wasted };
}
