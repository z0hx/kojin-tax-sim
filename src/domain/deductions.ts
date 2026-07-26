import type {
  AmountBracket,
  EarthquakeInsuranceTable,
  HumanDeductionAmountTable,
  InsuranceBracketTable,
  LifeInsuranceTable,
  SpouseDeductionTable,
  TaxParams,
} from '../taxParams/schema';
import {
  type DeductionBreakdown,
  type Dependent,
  type DisabilityInput,
  type LifeInsuranceInput,
  type MedicalInput,
  type SpouseInput,
  type YearProfile,
  floorYen,
  type Yen,
} from './types';

export function lookupAmountBracket(income: number, table: AmountBracket[]): Yen {
  const bracket = table.find((b) => b.upTo === null || income <= b.upTo) ?? table[table.length - 1];
  return bracket.amount as Yen;
}

export function lookupBasicDeduction(totalIncome: Yen, table: AmountBracket[]): Yen {
  return lookupAmountBracket(totalIncome, table);
}

function calcInsuranceBracketValue(paid: number, table: InsuranceBracketTable, capOverride?: number): Yen {
  const bracket = table.brackets.find((b) => b.upTo === null || paid <= b.upTo) ?? table.brackets[table.brackets.length - 1];
  const value = bracket.rate === 0 && capOverride !== undefined ? capOverride : paid * bracket.rate + bracket.addend;
  return floorYen(Math.max(0, value));
}

function finalCap(table: InsuranceBracketTable): number {
  return table.brackets[table.brackets.length - 1].addend;
}

function combineNewOld(newAmount: Yen, oldAmount: Yen, cap: number): Yen {
  return Math.max(newAmount, oldAmount, Math.min(newAmount + oldAmount, cap)) as Yen;
}

/** 03詳細設計書§3.3。新旧・区分ごとに計算し、区分単位・合計単位の上限を適用する */
export function calcLifeInsuranceDeduction(input: LifeInsuranceInput, table: LifeInsuranceTable): Yen {
  const generalCapOverride = input.hasChildUnder23 ? table.newGeneralChildUnder23Cap : undefined;
  const newGeneral = calcInsuranceBracketValue(input.new.general, table.newGeneral, generalCapOverride);
  const oldGeneral = calcInsuranceBracketValue(input.old.general, table.oldGeneral);
  const generalCap = generalCapOverride ?? finalCap(table.newGeneral);
  const general = combineNewOld(newGeneral, oldGeneral, generalCap);

  const nursing = calcInsuranceBracketValue(input.new.nursing, table.newNursing);

  const newPension = calcInsuranceBracketValue(input.new.pension, table.newPension);
  const oldPension = calcInsuranceBracketValue(input.old.pension, table.oldPension);
  const pension = combineNewOld(newPension, oldPension, finalCap(table.newPension));

  return Math.min(general + nursing + pension, table.newTotalCap) as Yen;
}

/** 地震保険料控除。長期(地震保険料本体)・短期(旧長期損害保険料の経過措置)を合算する */
export function calcEarthquakeInsuranceDeduction(
  input: { long: number; short: number },
  table: EarthquakeInsuranceTable
): Yen {
  const mainRaw = table.halveMainAmount ? input.long / 2 : input.long;
  const main = Math.min(floorYen(mainRaw), table.cap);

  let oldLongTerm: number;
  if (input.short <= table.oldLongTermBracket1) {
    oldLongTerm = input.short;
  } else if (input.short <= table.oldLongTermBracket2) {
    oldLongTerm = Math.floor(input.short / 2) + table.oldLongTermAddend;
  } else {
    oldLongTerm = table.oldLongTermCap;
  }

  return Math.min(main + oldLongTerm, table.cap) as Yen;
}

export interface MedicalDeductionResult {
  amount: Yen;
  thresholdUsed: Yen;
  thresholdBasis: 'fixed100000' | 'incomeRatio5pct';
  selfMedicationAmount: Yen;
  chosenMode: 'medical' | 'selfMedication';
}

export function calcMedicalDeduction(
  input: MedicalInput,
  totalIncome: Yen,
  params: TaxParams['incomeTax']['medical']
): MedicalDeductionResult {
  const incomeRatioThreshold = totalIncome * params.thresholdIncomeRatio;
  const thresholdUsed = Math.min(params.thresholdFixed, incomeRatioThreshold) as Yen;
  const thresholdBasis: MedicalDeductionResult['thresholdBasis'] =
    incomeRatioThreshold < params.thresholdFixed ? 'incomeRatio5pct' : 'fixed100000';

  const medicalAmount = Math.min(
    Math.max(0, input.paid - input.reimbursed - thresholdUsed),
    params.cap
  ) as Yen;
  const selfMedicationAmount = Math.min(
    Math.max(0, input.selfMedication - params.selfMedicationDeductible),
    params.selfMedicationCap
  ) as Yen;

  let chosenMode: MedicalDeductionResult['chosenMode'];
  let amount: Yen;
  if (input.mode === 'auto') {
    chosenMode = selfMedicationAmount > medicalAmount ? 'selfMedication' : 'medical';
    amount = chosenMode === 'selfMedication' ? selfMedicationAmount : medicalAmount;
  } else {
    chosenMode = input.mode;
    amount = chosenMode === 'selfMedication' ? selfMedicationAmount : medicalAmount;
  }

  return { amount, thresholdUsed, thresholdBasis, selfMedicationAmount, chosenMode };
}

function roundToTenThousand(v: number): number {
  return Math.round(v / 10_000) * 10_000;
}

/** 納税者本人の合計所得金額による逓減倍率(900万/950万/1000万円の3区分) */
function spouseTierMultiplier(taxpayerTotalIncome: number, thresholds: [number, number]): number {
  if (taxpayerTotalIncome <= thresholds[0]) return 1;
  if (taxpayerTotalIncome <= thresholds[1]) return 2 / 3;
  return 1 / 3;
}

/**
 * 配偶者控除・配偶者特別控除。納税者本人の合計所得金額(900万/950万/1000万円)による逓減と、
 * 配偶者の合計所得金額(48万円以下=配偶者控除、48万円超133万円以下=配偶者特別控除)の
 * 両方を考慮する(03詳細設計書§3.2、実装時にHigh#1として是正)。
 */
export function calcSpouseDeduction(
  input: SpouseInput | undefined,
  taxpayerTotalIncome: Yen,
  table: SpouseDeductionTable
): Yen {
  if (!input) return 0 as Yen;
  if (taxpayerTotalIncome > table.taxpayerIncomeCutoff) return 0 as Yen;
  if (input.totalIncome > 1_330_000) return 0 as Yen;

  const multiplier = spouseTierMultiplier(taxpayerTotalIncome, table.taxpayerIncomeTierThresholds);
  const scale = (base: number) => (multiplier === 1 ? base : roundToTenThousand(base * multiplier));

  if (input.totalIncome <= 480_000) {
    return scale(input.isElderly ? table.regularElderlyBase : table.regularGeneralBase) as Yen;
  }

  const row = table.special.find((r) => input.totalIncome <= r.spouseIncomeUpTo);
  return (row ? scale(row.amount) : 0) as Yen;
}

/** 扶養控除の対象は16歳以上(年少扶養親族は対象外。児童手当に一本化されているため) */
const DEPENDENT_MIN_AGE = 16;

export function calcDependentDeduction(dependents: Dependent[], table: HumanDeductionAmountTable): Yen {
  return dependents.reduce((sum, d) => {
    if (d.age < DEPENDENT_MIN_AGE) return sum;
    if (d.age >= 19 && d.age <= 22) return sum + table.dependentSpecific;
    if (d.age >= 70) return sum + (d.isCoresidentElderlyParent ? table.dependentElderlyCoresident : table.dependentElderlyOther);
    return sum + table.dependentGeneral;
  }, 0) as Yen;
}

export function calcDisabilityDeduction(inputs: DisabilityInput[], table: HumanDeductionAmountTable): Yen {
  const amounts: Record<DisabilityInput['severity'], number> = {
    general: table.disabilityGeneral,
    special: table.disabilitySpecial,
    specialCoresident: table.disabilitySpecialCoresident,
  };
  return inputs.reduce((sum, d) => sum + amounts[d.severity], 0) as Yen;
}

export function calcSingleParentDeduction(isSingleParent: boolean, table: HumanDeductionAmountTable): Yen {
  return (isSingleParent ? table.singleParent : 0) as Yen;
}

function baseBreakdown(): DeductionBreakdown {
  return {
    basic: 0 as Yen,
    socialInsurance: 0 as Yen,
    lifeInsurance: 0 as Yen,
    earthquakeInsurance: 0 as Yen,
    medical: 0 as Yen,
    ideco: 0 as Yen,
    spouse: 0 as Yen,
    dependents: 0 as Yen,
    disability: 0 as Yen,
    singleParent: 0 as Yen,
    donation: 0 as Yen,
    total: 0 as Yen,
  };
}

function sumBreakdown(b: Omit<DeductionBreakdown, 'total'>): DeductionBreakdown {
  const total = (b.basic + b.socialInsurance + b.lifeInsurance + b.earthquakeInsurance + b.medical + b.ideco + b.spouse + b.dependents + b.disability + b.singleParent + b.donation) as Yen;
  return { ...b, total };
}

function resolveSocialInsurance(profile: YearProfile, actualSum: Yen): Yen {
  return (profile.deductions.socialInsuranceOverride ?? actualSum) as Yen;
}

export function calcIncomeTaxDeductionBreakdown(
  profile: YearProfile,
  totalIncome: Yen,
  socialInsuranceSum: Yen,
  params: TaxParams
): DeductionBreakdown {
  const d = profile.deductions;
  const base = baseBreakdown();
  const medicalResult = calcMedicalDeduction(d.medical, totalIncome, params.incomeTax.medical);
  return sumBreakdown({
    ...base,
    basic: lookupBasicDeduction(totalIncome, params.incomeTax.basicDeduction),
    socialInsurance: resolveSocialInsurance(profile, socialInsuranceSum),
    lifeInsurance: calcLifeInsuranceDeduction(d.lifeInsurance, params.incomeTax.lifeInsurance),
    earthquakeInsurance: calcEarthquakeInsuranceDeduction(d.earthquakeInsurance, params.incomeTax.earthquakeInsurance),
    medical: medicalResult.amount,
    ideco: d.ideco as Yen,
    spouse: calcSpouseDeduction(d.spouse, totalIncome, params.incomeTax.spouseDeduction),
    dependents: calcDependentDeduction(d.dependents, params.incomeTax.humanDeductions),
    disability: calcDisabilityDeduction(d.disabilityDeductions, params.incomeTax.humanDeductions),
    singleParent: calcSingleParentDeduction(d.isSingleParent, params.incomeTax.humanDeductions),
  });
}

export function calcResidentTaxDeductionBreakdown(
  profile: YearProfile,
  totalIncome: Yen,
  socialInsuranceSum: Yen,
  params: TaxParams
): DeductionBreakdown {
  const d = profile.deductions;
  const base = baseBreakdown();
  const medicalResult = calcMedicalDeduction(d.medical, totalIncome, params.incomeTax.medical);
  return sumBreakdown({
    ...base,
    basic: lookupBasicDeduction(totalIncome, params.residentTax.basicDeduction),
    socialInsurance: resolveSocialInsurance(profile, socialInsuranceSum),
    lifeInsurance: calcLifeInsuranceDeduction(d.lifeInsurance, params.residentTax.lifeInsurance),
    earthquakeInsurance: calcEarthquakeInsuranceDeduction(d.earthquakeInsurance, params.residentTax.earthquakeInsurance),
    medical: medicalResult.amount,
    ideco: d.ideco as Yen,
    spouse: calcSpouseDeduction(d.spouse, totalIncome, params.residentTax.spouseDeduction),
    dependents: calcDependentDeduction(d.dependents, params.residentTax.humanDeductions),
    disability: calcDisabilityDeduction(d.disabilityDeductions, params.residentTax.humanDeductions),
    singleParent: calcSingleParentDeduction(d.isSingleParent, params.residentTax.humanDeductions),
    // 寄附金は住民税では税額控除のため所得控除には含めない(donationは常に0のまま)
  });
}
