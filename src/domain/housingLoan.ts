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

export function calcResidentTaxCap(
  taxableResident: Yen,
  rule: HousingLoanInput['residentTaxCapRule'] | undefined,
  rules: { rule5pct97500: HousingLoanCapRule; rule7pct136500: HousingLoanCapRule }
): Yen {
  if (!rule) return 0 as Yen;
  const r = rules[rule];
  return Math.min(floorYen(taxableResident * r.ratio), r.cap) as Yen;
}

export function applyToResidentTax(carried: Yen, cap: Yen, availableLevy: Yen): { used: Yen; wasted: Yen } {
  const used = Math.min(carried, cap, availableLevy) as Yen;
  const wasted = (carried - used) as Yen;
  return { used, wasted };
}
