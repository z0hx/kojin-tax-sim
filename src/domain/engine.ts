import type { TaxParams } from '../taxParams/schema';
import {
  calcIncomeTaxDeductionBreakdown,
  calcResidentTaxDeductionBreakdown,
} from './deductions';
import { findFurusatoLimit } from './furusato';
import {
  applyLeavePeriods,
  calcGrossIncome,
  calcSalaryDeduction,
  calcSalaryIncome,
  sumBonusSocialInsurance,
  sumMonthlySocialInsurance,
  sumNonTaxableBenefits,
  estimateAnnualIncome,
} from './income';
import {
  applyToIncomeTax,
  applyToResidentTax,
  calcCreditAvailable,
  calcResidentTaxCap,
} from './housingLoan';
import {
  calcCalculatedTax,
  calcIncomeTaxTotal,
  calcReconstructionTax,
  calcTaxableIncome,
  lookupTaxRate,
} from './incomeTax';
import {
  calcAdjustmentCredit,
  calcFurusatoBasicCredit,
  calcFurusatoSpecialCredit,
  calcHumanDeductionDiff,
  calcIncomeLevy,
  calcIncomeLevyBeforeAdjustment,
  calcIncomeLevyFinal,
  calcNonTaxableHeadcount,
  calcPerCapitaLevy,
  isIncomeLevyNonTaxable,
  isPerCapitaLevyNonTaxable,
} from './residentTax';
import {
  type CalculationResult,
  type DeductionBreakdown,
  floor100,
  floorYen,
  type FurusatoCapMode,
  type TaxSnapshot,
  type TraceStep,
  type YearProfile,
  type Yen,
} from './types';
import { runAllWarningChecks } from './warnings';

function withDonation(base: DeductionBreakdown, donationDeduction: Yen): DeductionBreakdown {
  return { ...base, donation: donationDeduction, total: (base.total + donationDeduction) as Yen };
}

/** 単一ケース(寄附額Dを固定)の税額計算。03詳細設計書§3.9の手順に対応する */
export function calcSnapshot(profile: YearProfile, donation: Yen, params: TaxParams, mode: FurusatoCapMode): TaxSnapshot {
  const trace: TraceStep[] = [];
  const push = (key: string, label: string, value: number, formula?: string) => trace.push({ key, label, value, formula });

  // --- 1. 所得 ---
  const income = applyLeavePeriods(profile.income, profile.year);
  const grossTotal = calcGrossIncome(income);
  const salaryDeduction = calcSalaryDeduction(grossTotal, params.incomeTax.salaryDeduction);
  const salaryIncome = calcSalaryIncome(grossTotal, params.incomeTax.salaryDeduction);
  const totalIncome = salaryIncome;
  const nonTaxableBenefits = sumNonTaxableBenefits(income);
  push('grossTotal', '給与収入合計', grossTotal);
  push('salaryDeduction', '給与所得控除', salaryDeduction, '02仕様書§3.2.1');
  push('salaryIncome', '給与所得(合計所得金額)', salaryIncome);

  const socialInsuranceSum = (sumMonthlySocialInsurance(income) + sumBonusSocialInsurance(income)) as Yen;

  // --- 2. 所得控除(所得税) ---
  const dedIncomeTaxBase = calcIncomeTaxDeductionBreakdown(profile, totalIncome, socialInsuranceSum, params);
  const donationDeduction = donation > 0
    ? floorYen(Math.max(0, Math.min(donation, totalIncome * params.incomeTax.donationDeductionIncomeRatioCap) - 2000))
    : (0 as Yen);
  const incomeTaxDeductions = withDonation(dedIncomeTaxBase, donationDeduction);
  push('incomeTaxDeductionsTotal', '所得控除合計(所得税)', incomeTaxDeductions.total);

  // --- 3. 所得税 ---
  const taxableIncome = calcTaxableIncome(totalIncome, incomeTaxDeductions.total);
  const { rate, offset } = lookupTaxRate(taxableIncome, params.incomeTax.brackets);
  const calculatedTax = calcCalculatedTax(taxableIncome, rate, offset);
  push('taxableIncome', '課税総所得金額(所得税)', taxableIncome);
  push('marginalRate', '限界税率', rate);
  push('calculatedTax', '算出所得税額', calculatedTax);

  // 住宅ローン控除(所得税)
  const hlCredit = calcCreditAvailable(profile.housingLoan, profile.year);
  const { used: hlUsedIncomeTax, carried: hlCarried } = applyToIncomeTax(hlCredit, calculatedTax);
  const taxAfterCredits = floor100((calculatedTax - hlUsedIncomeTax) as number);
  const reconstructionTax = calcReconstructionTax(taxAfterCredits, params.incomeTax.reconstructionSurtaxRate);
  const incomeTaxTotal = calcIncomeTaxTotal(taxAfterCredits, reconstructionTax);
  push('housingLoanCreditAvailable', '住宅ローン控除可能額', hlCredit);
  push('housingLoanUsedIncomeTax', '所得税から控除', hlUsedIncomeTax);
  push('taxAfterCredits', '差引所得税額', taxAfterCredits);
  push('reconstructionTax', '復興特別所得税', reconstructionTax);

  // --- 4. 住民税 ---
  const dedResidentTax = calcResidentTaxDeductionBreakdown(profile, totalIncome, socialInsuranceSum, params);
  const taxableResident = calcTaxableIncome(totalIncome, dedResidentTax.total);
  push('residentDeductionsTotal', '所得控除合計(住民税)', dedResidentTax.total);
  push('taxableResident', '課税総所得金額(住民税)', taxableResident);

  // 住民税の非課税限度額。所得割の基準額のほうが均等割より高いため、扶養親族等がいる場合は
  // 「均等割は課税されるが所得割は非課税」という帯域が生じうる(レビュー2巡目High#1是正)。
  // 頭数には扶養親族に加え、同一生計配偶者(合計所得48万円以下)も含める(レビュー3巡目High是正)。
  const nonTaxableHeadcount = calcNonTaxableHeadcount(profile.deductions.dependents.length, profile.deductions.spouse);
  const incomeNonTaxable = isIncomeLevyNonTaxable(totalIncome, nonTaxableHeadcount, params.residentTax.nonTaxableThreshold);
  const perCapitaNonTaxable = isPerCapitaLevyNonTaxable(totalIncome, nonTaxableHeadcount, params.residentTax.nonTaxableThreshold);

  const levyBefore = incomeNonTaxable
    ? (0 as Yen)
    : calcIncomeLevyBeforeAdjustment(taxableResident, profile.municipality.municipalIncomeRate, profile.municipality.prefecturalIncomeRate);
  const humanDeductionDiff = calcHumanDeductionDiff(
    profile,
    totalIncome,
    params.residentTax.humanDeductionDiff,
    params.incomeTax.spouseDeduction,
    params.residentTax.spouseDeduction
  );
  const adjustmentCredit = incomeNonTaxable
    ? (0 as Yen)
    : calcAdjustmentCredit(
        taxableResident,
        humanDeductionDiff,
        params.residentTax.adjustmentCreditMinimum,
        totalIncome,
        params.residentTax.adjustmentCreditIncomeCutoff
      );
  const incomeLevy = incomeNonTaxable ? (0 as Yen) : calcIncomeLevy(levyBefore, adjustmentCredit);
  push('incomeLevyBeforeAdj', '所得割(調整控除前)', levyBefore);
  push('adjustmentCredit', '調整控除', adjustmentCredit);
  push('incomeLevy', '所得割額(20%枠基準)', incomeLevy);

  // 住宅ローン住民税上限(モードに依らず同一)
  const hlResidentCap = incomeNonTaxable
    ? (0 as Yen)
    : calcResidentTaxCap(taxableResident, profile.housingLoan?.residentTaxCapRule, params.residentTax.housingLoanCapRules);

  // conservativeモード用: 住宅ローン控除適用後の所得割額を仮に算出し、20%枠の基準にのみ用いる(03詳細設計書§3.6)
  const incomeLevyBasisForCap =
    mode === 'standard' ? incomeLevy : ((incomeLevy - Math.min(hlCarried, hlResidentCap, incomeLevy)) as Yen);

  const furusatoCreditBasic = incomeNonTaxable
    ? (0 as Yen)
    : calcFurusatoBasicCredit(donation, totalIncome, params.residentTax.furusatoBasicRate, params.residentTax.furusatoIncomeRatioCap);
  const specialResult = incomeNonTaxable
    ? { raw: 0 as Yen, capped: 0 as Yen, capReached: false }
    : calcFurusatoSpecialCredit(
        donation,
        totalIncome,
        rate,
        incomeLevyBasisForCap,
        params.residentTax.furusatoIncomeRatioCap,
        params.residentTax.furusatoSpecialCapRatio,
        params.incomeTax.reconstructionSurtaxRate
      );
  push('furusatoCreditBasic', '寄附金税額控除(基本分)', furusatoCreditBasic);
  push('furusatoCreditSpecial', '寄附金税額控除(特例分)', specialResult.capped);

  const afterFurusato = Math.max(0, incomeLevy - furusatoCreditBasic - specialResult.capped) as Yen;
  const { used: hlUsedResident, wasted: hlWasted } = incomeNonTaxable
    ? { used: 0 as Yen, wasted: hlCarried }
    : applyToResidentTax(hlCarried, hlResidentCap, afterFurusato);
  const incomeLevyFinal = incomeNonTaxable ? (0 as Yen) : calcIncomeLevyFinal(afterFurusato, hlUsedResident);
  const perCapitaLevy = perCapitaNonTaxable ? (0 as Yen) : calcPerCapitaLevy(profile.municipality);
  const residentTotal = (incomeLevyFinal + perCapitaLevy) as Yen;
  push('residentIncomeNonTaxable', '住民税(所得割)非課税限度額の適用', incomeNonTaxable ? 1 : 0);
  push('residentPerCapitaNonTaxable', '住民税(均等割)非課税限度額の適用', perCapitaNonTaxable ? 1 : 0);
  push('housingLoanResidentCap', '住宅ローン控除 住民税上限', hlResidentCap);
  push('housingLoanUsedResident', '住民税から控除', hlUsedResident);
  push('housingLoanWasted', '住宅ローン控除 切り捨て損失', hlWasted);
  push('incomeLevyFinal', '住民税所得割(確定)', incomeLevyFinal);
  push('perCapitaLevy', '均等割+森林環境税', perCapitaLevy);

  return {
    income: { grossTotal, salaryDeduction, salaryIncome, totalIncome, nonTaxableBenefits },
    incomeTax: {
      deductions: incomeTaxDeductions,
      taxableIncome,
      marginalRate: rate,
      calculatedTax,
      housingLoanApplied: hlUsedIncomeTax,
      taxAfterCredits,
      reconstructionTax,
      total: incomeTaxTotal,
    },
    residentTax: {
      deductions: dedResidentTax,
      taxableIncome: taxableResident,
      incomeLevyBeforeAdj: levyBefore,
      adjustmentCredit,
      incomeLevy,
      furusatoCreditBasic,
      furusatoCreditSpecial: specialResult.capped,
      housingLoanApplied: hlUsedResident,
      incomeLevyFinal,
      perCapitaLevy,
      total: residentTotal,
    },
    housingLoan: {
      creditAvailable: hlCredit,
      usedInIncomeTax: hlUsedIncomeTax,
      carriedToResidentTax: hlCarried,
      residentTaxCap: hlResidentCap,
      wasted: hlWasted,
    },
    marginalRate: rate,
    furusato: { basicCredit: furusatoCreditBasic, specialCredit: specialResult.capped, specialCapReached: specialResult.capReached },
    trace,
  };
}

/** CalculationResult全体を組み立てる。standard/conservative両モードのfindFurusatoLimitを実行する */
export function buildCalculationResult(
  profile: YearProfile,
  params: TaxParams
): CalculationResult & { furusatoConservative: CalculationResult['furusato']; confidenceRatio: number } {
  const mode: FurusatoCapMode = 'standard';
  const limitStandard = findFurusatoLimit(profile, params, 'standard');
  const limitConservative = findFurusatoLimit(profile, params, 'conservative');

  const snapshotAtZero = limitStandard.snapshotAtZero;
  const snapshotAtDonated = calcSnapshot(profile, profile.furusato.donatedAmount as Yen, params, mode);
  const incomeEstimate = estimateAnnualIncome(profile.income, { fillMode: 'lastActual' });

  const warnings = runAllWarningChecks({
    snapshotAtZero,
    snapshotAtDonated,
    limitResult: limitStandard,
    profile,
    incomeEstimate,
  });

  const selfBurdenAtLimit = (limitStandard.limit -
    ((snapshotAtZero.incomeTax.total - limitStandard.snapshotAtLimit.incomeTax.total) +
      (snapshotAtZero.residentTax.total - limitStandard.snapshotAtLimit.residentTax.total))) as Yen;

  const result: CalculationResult = {
    income: snapshotAtDonated.income,
    incomeTax: snapshotAtDonated.incomeTax,
    residentTax: snapshotAtDonated.residentTax,
    housingLoan: snapshotAtDonated.housingLoan,
    furusato: {
      limitAmount: limitStandard.limit,
      recommendedAmount: limitStandard.recommended,
      approxByFormula: limitStandard.approxByFormula,
      breakdown: {
        donation: limitStandard.limit,
        incomeTaxReduction: (snapshotAtZero.incomeTax.total - limitStandard.snapshotAtLimit.incomeTax.total) as Yen,
        residentBasic: limitStandard.snapshotAtLimit.residentTax.furusatoCreditBasic,
        residentSpecial: limitStandard.snapshotAtLimit.residentTax.furusatoCreditSpecial,
        selfBurden: selfBurdenAtLimit,
      },
      specialCapReached: limitStandard.snapshotAtLimit.furusato.specialCapReached,
    },
    warnings,
    trace: snapshotAtDonated.trace,
  };

  return {
    ...result,
    furusatoConservative: { ...result.furusato, limitAmount: limitConservative.limit, recommendedAmount: limitConservative.recommended },
    // 収入見込みの確定率(実績月数/12)。S-02収入入力画面で表示するために公開する(FR-03/W-06と同じ値)
    confidenceRatio: incomeEstimate.confidenceRatio,
  };
}
