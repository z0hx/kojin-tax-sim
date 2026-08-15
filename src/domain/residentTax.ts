import type { Bracket, HumanDeductionDiffTable, SpouseDeductionTable } from '../taxParams/schema';
import { calcDependentDeduction, calcDisabilityDeduction, calcSingleParentDeduction, calcSpouseDeduction } from './deductions';
import { lookupTaxRate } from './incomeTax';
import { floor100, floorYen, type MunicipalityConfig, type SpouseInput, type YearProfile, type Yen } from './types';

/**
 * 非課税限度額の算式で「本人以外」として数える人数(扶養親族数 + 同一生計配偶者)。
 * 同一生計配偶者の所得要件(`spouseIncomeLimit`)は年分で動くため、税制パラメータの
 * residentTax.spouseDeduction.regularIncomeLimitを渡す(令和7年分58万円、令和8年分以後62万円)。
 * (レビュー3巡目High是正: 配偶者が頭数に含まれておらず、扶養親族はいないが低所得の配偶者がいる
 * 世帯を非課税判定から漏らしていた。)
 */
export function calcNonTaxableHeadcount(dependentsCount: number, spouse: SpouseInput | undefined, spouseIncomeLimit: number): number {
  const hasQualifyingSpouse = !!spouse && spouse.totalIncome <= spouseIncomeLimit;
  return dependentsCount + (hasQualifyingSpouse ? 1 : 0);
}

/**
 * 02仕様書§3.3.1: 所得税・住民税の人的控除額の差の合計(D)。
 * 配偶者(特別)控除は納税者本人の所得により逓減するため、所得税・住民税それぞれの
 * 実際の控除額を計算したうえで差を取る(固定値の差分テーブルでは表現できないため)。
 */
export function calcHumanDeductionDiff(
  profile: YearProfile,
  totalIncome: Yen,
  diffTable: HumanDeductionDiffTable,
  incomeTaxSpouseTable: SpouseDeductionTable,
  residentTaxSpouseTable: SpouseDeductionTable
): Yen {
  const ded = profile.deductions;
  const spouseDiff = (calcSpouseDeduction(ded.spouse, totalIncome, incomeTaxSpouseTable) -
    calcSpouseDeduction(ded.spouse, totalIncome, residentTaxSpouseTable)) as Yen;
  return (diffTable.basic +
    spouseDiff +
    calcDependentDeduction(ded.dependents, diffTable) +
    calcDisabilityDeduction(ded.disabilityDeductions, diffTable) +
    calcSingleParentDeduction(ded.isSingleParent, diffTable)) as Yen;
}

export interface NonTaxableThresholdTable {
  baseNoDependents: number;
  perPersonAmount: number;
  commonAddition: number;
  perCapitaAddition: number;
  incomeAddition: number;
}

/**
 * 住民税の非課税限度額。所得割の基準額のほうが均等割より高いため、扶養親族等がいる場合は
 * 「合計所得金額が均等割の基準は超えたが所得割の基準は超えていない」帯域が生じうる。
 * `headcount`は`calcNonTaxableHeadcount`(扶養親族数+同一生計配偶者)で算出した値を渡すこと。
 * 級地区分により実際の基準額は異なるため、級地1相当の近似値であることに注意(要確認パラメータ)。
 */
function calcNonTaxableThresholdFor(headcount: number, base: number, addition: number, table: NonTaxableThresholdTable): Yen {
  if (headcount === 0) return base as Yen;
  return (table.perPersonAmount * (1 + headcount) + table.commonAddition + addition) as Yen;
}

export function calcPerCapitaNonTaxableThreshold(headcount: number, table: NonTaxableThresholdTable): Yen {
  return calcNonTaxableThresholdFor(headcount, table.baseNoDependents, table.perCapitaAddition, table);
}

export function calcIncomeLevyNonTaxableThreshold(headcount: number, table: NonTaxableThresholdTable): Yen {
  return calcNonTaxableThresholdFor(headcount, table.baseNoDependents, table.incomeAddition, table);
}

export function isPerCapitaLevyNonTaxable(totalIncome: Yen, headcount: number, table: NonTaxableThresholdTable): boolean {
  return totalIncome <= calcPerCapitaNonTaxableThreshold(headcount, table);
}

export function isIncomeLevyNonTaxable(totalIncome: Yen, headcount: number, table: NonTaxableThresholdTable): boolean {
  return totalIncome <= calcIncomeLevyNonTaxableThreshold(headcount, table);
}

export function calcAdjustmentCredit(taxableResident: Yen, humanDeductionDiff: Yen, minimum: number, totalIncome: Yen, incomeCutoff: number): Yen {
  // 02仕様書§3.3.1: 合計所得金額がこれを超えると調整控除は適用されない
  if (totalIncome > incomeCutoff) return 0 as Yen;
  if (taxableResident <= 2_000_000) {
    return floorYen(Math.min(humanDeductionDiff, taxableResident) * 0.05);
  }
  return floorYen(Math.max((humanDeductionDiff - (taxableResident - 2_000_000)) * 0.05, minimum));
}

export function calcIncomeLevyBeforeAdjustment(taxableResident: Yen, municipalRate: number, prefecturalRate: number): Yen {
  return floorYen(taxableResident * (municipalRate + prefecturalRate));
}

export function calcIncomeLevy(before: Yen, adjustment: Yen): Yen {
  return Math.max(0, before - adjustment) as Yen;
}

export function calcFurusatoBasicCredit(donation: Yen, totalIncome: Yen, basicRate: number, incomeRatioCap: number): Yen {
  const target = Math.min(donation, totalIncome * incomeRatioCap);
  return floorYen(Math.max(0, target - 2000) * basicRate);
}

export interface FurusatoSpecialCreditResult {
  raw: Yen;
  capped: Yen;
  capReached: boolean;
}

export function calcFurusatoSpecialCredit(
  donation: Yen,
  totalIncome: Yen,
  marginalRate: number,
  incomeLevy: Yen,
  incomeRatioCap: number,
  specialCapRatio: number,
  reconstructionSurtaxRate: number
): FurusatoSpecialCreditResult {
  const target = Math.min(donation, totalIncome * incomeRatioCap);
  const raw = floorYen(Math.max(0, target - 2000) * (0.9 - marginalRate * (1 + reconstructionSurtaxRate)));
  const capValue = floorYen(incomeLevy * specialCapRatio);
  const capped = Math.min(raw, capValue) as Yen;
  return { raw, capped, capReached: raw > capValue };
}

/**
 * 特例控除額・申告特例控除額の算式で使う所得税の税率(02仕様書§3.3.2)。
 * 所得税の課税総所得金額ではなく、住民税の課税総所得金額から人的控除差の合計額を控除した金額に
 * 応じた税率を用いる(地方税法附則第7条の2)。この金額が0円以下なら税率0%として扱い、
 * 特例分の割合は90%になる。
 */
export function lookupFurusatoSpecialRate(taxableResident: Yen, humanDeductionDiff: Yen, brackets: Bracket[]): number {
  const base = taxableResident - humanDeductionDiff;
  if (base <= 0) return 0;
  return lookupTaxRate(base as Yen, brackets).rate;
}

/**
 * ワンストップ特例の申告特例控除額(地方税法附則第7条の2第2項)。
 * ワンストップ特例では所得税の寄附金控除を行わないため、所得税から控除されるはずだった
 * 「(寄附額−2,000円)×所得税率×1.021」に相当する額を住民税から控除して穴埋めする。
 * 特例控除額に対する比率で定義されており、特例控除額が20%枠で頭打ちになっていれば
 * 申告特例控除額もそれに応じて小さくなる。
 */
export function calcFurusatoOneStopCredit(specialCredit: Yen, marginalRate: number, reconstructionSurtaxRate: number): Yen {
  const rateWithSurtax = marginalRate * (1 + reconstructionSurtaxRate);
  const specialRatio = 0.9 - rateWithSurtax;
  if (rateWithSurtax <= 0 || specialRatio <= 0) return 0 as Yen;
  return floorYen(specialCredit * (rateWithSurtax / specialRatio));
}

export function calcPerCapitaLevy(config: MunicipalityConfig): Yen {
  return (config.municipalPerCapita + config.prefecturalPerCapita + config.forestTax) as Yen;
}

export function calcIncomeLevyFinal(afterFurusato: Yen, hlInResident: Yen): Yen {
  return floor100(Math.max(0, afterFurusato - hlInResident));
}
