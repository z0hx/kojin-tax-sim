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
  const push = (key: string, label: string, value: number, formula?: string, refs?: string[]) =>
    trace.push({ key, label, value, formula, refs });

  // --- 1. 所得 ---
  const income = applyLeavePeriods(profile.income, profile.year);
  const grossTotal = calcGrossIncome(income);
  const salaryDeduction = calcSalaryDeduction(grossTotal, params.incomeTax.salaryDeduction);
  const salaryIncome = calcSalaryIncome(grossTotal, params.incomeTax.salaryDeduction);
  const totalIncome = salaryIncome;
  const nonTaxableBenefits = sumNonTaxableBenefits(income);
  push('grossTotal', '給与収入合計', grossTotal, '月次給与合計 + 賞与合計 + 他の支払者からの給与収入', ['02仕様書§2.2']);
  push('salaryDeduction', '給与所得控除', salaryDeduction, '給与収入の区分別計算式(表引き)と最低保障額の大きいほう', ['02仕様書§3.2.1']);
  push('salaryIncome', '給与所得(合計所得金額)', salaryIncome, '給与収入 − 給与所得控除', ['02仕様書§3.2.1']);

  const socialInsuranceSum = (sumMonthlySocialInsurance(income) + sumBonusSocialInsurance(income)) as Yen;

  // --- 2. 所得控除(所得税) ---
  const dedIncomeTaxBase = calcIncomeTaxDeductionBreakdown(profile, totalIncome, socialInsuranceSum, params);
  const donationDeduction = donation > 0
    ? floorYen(Math.max(0, Math.min(donation, totalIncome * params.incomeTax.donationDeductionIncomeRatioCap) - 2000))
    : (0 as Yen);
  const incomeTaxDeductions = withDonation(dedIncomeTaxBase, donationDeduction);
  push(
    'incomeTaxDeductionsTotal',
    '所得控除合計(所得税)',
    incomeTaxDeductions.total,
    '基礎控除+社会保険料+生命保険料+地震保険料+医療費控除+iDeCo等+配偶者控除+扶養控除+障害者控除+ひとり親控除+寄附金控除',
    ['02仕様書§3.2.2(基礎控除)', '02仕様書§3.2.4(生命保険料控除)', '02仕様書§3.2.5(医療費控除)']
  );

  // --- 3. 所得税 ---
  const taxableIncome = calcTaxableIncome(totalIncome, incomeTaxDeductions.total);
  const { rate, offset } = lookupTaxRate(taxableIncome, params.incomeTax.brackets);
  const calculatedTax = calcCalculatedTax(taxableIncome, rate, offset);
  push('taxableIncome', '課税総所得金額(所得税)', taxableIncome, '(合計所得金額 − 所得控除合計) を1,000円未満切り捨て', ['02仕様書§1.3']);
  push('marginalRate', '限界税率', rate, '課税総所得金額に応じた超過累進税率(表引き)', ['02仕様書§3.2.3']);
  push('calculatedTax', '算出所得税額', calculatedTax, '課税総所得金額 × 税率 − 控除額', ['02仕様書§3.2.3']);

  // 住宅ローン控除(所得税)
  const hlCredit = calcCreditAvailable(profile.housingLoan, profile.year);
  const { used: hlUsedIncomeTax, carried: hlCarried } = applyToIncomeTax(hlCredit, calculatedTax);
  const taxAfterCredits = floor100((calculatedTax - hlUsedIncomeTax) as number);
  const reconstructionTax = calcReconstructionTax(taxAfterCredits, params.incomeTax.reconstructionSurtaxRate);
  const incomeTaxTotal = calcIncomeTaxTotal(taxAfterCredits, reconstructionTax);
  push(
    'housingLoanCreditAvailable',
    '住宅ローン控除可能額',
    hlCredit,
    'min(年末残高, 借入限度額) × 控除率(入居年+適用年数-1を過ぎた年は0円)',
    ['02仕様書§3.2.6']
  );
  push('housingLoanUsedIncomeTax', '所得税から控除', hlUsedIncomeTax, 'min(住宅ローン控除可能額, 算出所得税額)', ['02仕様書§3.2.6']);
  push('taxAfterCredits', '差引所得税額', taxAfterCredits, '(算出所得税額 − 住宅ローン控除) を100円未満切り捨て', ['02仕様書§1.3']);
  push('reconstructionTax', '復興特別所得税', reconstructionTax, '差引所得税額 × 2.1% を100円未満切り捨て', ['02仕様書§3.2.3']);

  // --- 4. 住民税 ---
  const dedResidentTax = calcResidentTaxDeductionBreakdown(profile, totalIncome, socialInsuranceSum, params);
  const taxableResident = calcTaxableIncome(totalIncome, dedResidentTax.total);
  push(
    'residentDeductionsTotal',
    '所得控除合計(住民税)',
    dedResidentTax.total,
    '基礎控除(住民税)+社会保険料+生命保険料+地震保険料+医療費控除+iDeCo等+配偶者控除+扶養控除+障害者控除+ひとり親控除',
    ['02仕様書§3.2.4(生命保険料控除)', '02仕様書§3.2.5(医療費控除)', '02仕様書§3.3(基礎控除・配偶者控除・扶養控除)']
  );
  push('taxableResident', '課税総所得金額(住民税)', taxableResident, '(合計所得金額 − 所得控除合計(住民税)) を1,000円未満切り捨て', ['02仕様書§1.3']);

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
  push('incomeLevyBeforeAdj', '所得割(調整控除前)', levyBefore, '課税総所得金額 × (市町村民税率 + 道府県民税率)', ['02仕様書§3.3']);
  push('adjustmentCredit', '調整控除', adjustmentCredit, '人的控除差の合計(D)と課税総所得金額に応じた算式', ['02仕様書§3.3.1']);
  push('incomeLevy', '所得割額(20%枠基準)', incomeLevy, '所得割(調整控除前) − 調整控除', ['02仕様書§3.3.1']);

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
  push('furusatoCreditBasic', '寄附金税額控除(基本分)', furusatoCreditBasic, '(対象寄附額 − 2,000円) × 10%', ['02仕様書§3.3.2']);
  push('furusatoCreditSpecial', '寄附金税額控除(特例分)', specialResult.capped, '(対象寄附額 − 2,000円) × (90% − 所得税率×1.021)、所得割額×20%を上限', ['02仕様書§3.3.2']);

  const afterFurusato = Math.max(0, incomeLevy - furusatoCreditBasic - specialResult.capped) as Yen;
  const { used: hlUsedResident, wasted: hlWasted } = incomeNonTaxable
    ? { used: 0 as Yen, wasted: hlCarried }
    : applyToResidentTax(hlCarried, hlResidentCap, afterFurusato);
  const incomeLevyFinal = incomeNonTaxable ? (0 as Yen) : calcIncomeLevyFinal(afterFurusato, hlUsedResident);
  const perCapitaLevy = perCapitaNonTaxable ? (0 as Yen) : calcPerCapitaLevy(profile.municipality);
  const residentTotal = (incomeLevyFinal + perCapitaLevy) as Yen;
  push('residentIncomeNonTaxable', '住民税(所得割)非課税限度額の適用', incomeNonTaxable ? 1 : 0, '合計所得金額が非課税限度額(所得割)以下か', ['02仕様書§3.3(非課税限度額(所得割))']);
  // 均等割の非課税限度額は02仕様書§3.3の表には所得割分の行しかなく、税制パラメータ
  // (residentTax.nonTaxableThreshold、taxParams/schema.tsにコメントで根拠を記載)にのみ
  // 定義がある。§3.3を根拠として案内すると「所得割の行しか無い」ことで誤解を招くため、
  // パラメータ側を根拠として明記する(実装後レビュー対応)。
  push('residentPerCapitaNonTaxable', '住民税(均等割)非課税限度額の適用', perCapitaNonTaxable ? 1 : 0, '合計所得金額が非課税限度額(均等割)以下か', [
    '税制パラメータ residentTax.nonTaxableThreshold(02仕様書§3.3に均等割の専用行は無い)',
  ]);
  push('housingLoanResidentCap', '住宅ローン控除 住民税上限', hlResidentCap, 'min(課税総所得金額(住民税) × 比率, 定額上限)', ['02仕様書§3.2.6']);
  push('housingLoanUsedResident', '住民税から控除', hlUsedResident, 'min(住宅ローン繰越額, 住民税上限, 寄附金税額控除後の所得割額)', ['02仕様書§3.2.6']);
  push('housingLoanWasted', '住宅ローン控除 切り捨て損失', hlWasted, '住宅ローン繰越額 − 住民税から控除した額', ['02仕様書§3.2.6']);
  push('incomeLevyFinal', '住民税所得割(確定)', incomeLevyFinal, '(寄附金税額控除後の所得割額 − 住宅ローン控除) を100円未満切り捨て', ['02仕様書§1.3']);
  push('perCapitaLevy', '均等割+森林環境税', perCapitaLevy, '市町村民税均等割 + 道府県民税均等割 + 森林環境税', ['02仕様書§3.3']);

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
