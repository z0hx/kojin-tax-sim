import type { ActualValues, CalculationResult, Yen } from './types';

/** 検算1項目分の比較結果(03詳細設計書§3.10)。 */
export interface ActualComparisonItem {
  label: string;
  calculated: Yen;
  actual: Yen;
  diffAbs: Yen;
  diffPct: number;
}

/** 実績値(actual)を基準とした差の割合(%)。actualが0円の場合は割合を定義できないため、
 *  計算値も0円なら一致(0%)、そうでなければ許容範囲外として扱うためInfinityを返す。 */
function diffPercent(calculated: number, actual: number): number {
  if (actual === 0) return calculated === 0 ? 0 : Infinity;
  return (Math.abs(calculated - actual) / Math.abs(actual)) * 100;
}

function buildItem(label: string, calculated: Yen, actual: number): ActualComparisonItem {
  return {
    label,
    calculated,
    actual: actual as Yen,
    diffAbs: Math.abs(calculated - actual) as Yen,
    diffPct: diffPercent(calculated, actual),
  };
}

/** 検算の許容誤差(%)。ActualComparisonItemの判定表示(UI側)もこの定数を参照し、
 *  withinToleranceの判定基準とドリフトしないようにする。 */
export const TOLERANCE_PCT = 1;

/**
 * FR-17検算モード(03詳細設計書§3.10)。ActualValuesのうち入力済みのフィールドのみを
 * CalculationResultの対応する値と突き合わせる(§10.10の対応表)。全項目の誤差が±1%以内
 * であれば`withinTolerance: true`。1項目も入力が無い場合は比較対象が無いためtrueとする
 * (「検算していない」ことと「検算して不一致」は区別し、後者のみ警告対象とする)。
 */
export function compareWithActuals(
  result: CalculationResult,
  actuals: ActualValues
): { items: ActualComparisonItem[]; withinTolerance: boolean } {
  const items: ActualComparisonItem[] = [];

  if (actuals.incomeTaxTotal !== undefined) {
    items.push(buildItem('源泉徴収税額(所得税+復興特別所得税)', result.incomeTax.total, actuals.incomeTaxTotal));
  }
  if (actuals.residentIncomeLevy !== undefined) {
    items.push(buildItem('住民税所得割額', result.residentTax.incomeLevyFinal, actuals.residentIncomeLevy));
  }
  if (actuals.residentPerCapita !== undefined) {
    items.push(buildItem('住民税均等割額', result.residentTax.perCapitaLevy, actuals.residentPerCapita));
  }
  if (actuals.housingLoanUsedIncomeTax !== undefined) {
    items.push(buildItem('住宅ローン控除(所得税から控除)', result.housingLoan.usedInIncomeTax, actuals.housingLoanUsedIncomeTax));
  }
  if (actuals.housingLoanUsedResident !== undefined) {
    items.push(buildItem('住宅ローン控除(住民税から控除)', result.residentTax.housingLoanApplied, actuals.housingLoanUsedResident));
  }

  const withinTolerance = items.every((item) => item.diffPct <= TOLERANCE_PCT);
  return { items, withinTolerance };
}
