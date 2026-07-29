/**
 * ドメイン層共通の型定義。02仕様書§1.3・§2、03詳細設計書§3.1に対応する。
 */

export type Yen = number & { readonly __brand: 'Yen' };

export function floorTo(v: number, unit: number): number {
  return Math.floor(v / unit) * unit;
}

export function floor1000(v: number): Yen {
  return floorTo(v, 1000) as Yen;
}

export function floor100(v: number): Yen {
  return floorTo(v, 100) as Yen;
}

export function floorYen(v: number): Yen {
  return Math.floor(v) as Yen;
}

/** フォーム入力など境界でのみ使う。整数・非負であることを検証してブランドを付与する */
export function asYen(v: number): Yen {
  if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
    throw new ValidationError([{ field: 'amount', rule: 'nonNegativeInteger', message: `金額は0以上の整数である必要があります: ${v}` }]);
  }
  return v as Yen;
}

export class ValidationError extends Error {
  issues: { field: string; rule: string; message: string }[];
  constructor(issues: { field: string; rule: string; message: string }[]) {
    super(issues.map((i) => i.message).join(', '));
    this.name = 'ValidationError';
    this.issues = issues;
  }
}

export interface TraceStep {
  key: string;
  label: string;
  value: number;
  formula?: string;
  refs?: string[];
}

/** 02仕様書 AppSettings.furusatoCapMode と同じ型 */
export type FurusatoCapMode = 'standard' | 'conservative';

// ---------------------------------------------------------------------------
// 収入 (02仕様書§2.2)
// ---------------------------------------------------------------------------

export interface MonthlyRecord {
  month: number; // 1-12
  status: 'actual' | 'estimated';
  grossSalary: number;
  socialInsurance: number;
  isSocialInsuranceExempt: boolean;
}

export interface Bonus {
  label: string;
  month: number;
  status: 'actual' | 'estimated';
  gross: number;
  socialInsurance: number;
  isExempt: boolean;
}

export interface LeavePeriod {
  type: 'childcare' | 'maternity' | 'other';
  startYm: string; // 'YYYY-MM'
  endYm: string;
  benefitAmount: number;
}

export interface IncomeInput {
  monthly: MonthlyRecord[]; // 長さ12
  bonuses: Bonus[];
  leavePeriods: LeavePeriod[];
  otherSalaryIncome: number;
}

// ---------------------------------------------------------------------------
// 所得控除 (02仕様書§2.2)
// ---------------------------------------------------------------------------

export interface LifeInsuranceInput {
  new: { general: number; nursing: number; pension: number };
  old: { general: number; pension: number };
  hasChildUnder23: boolean;
}

export interface MedicalInput {
  paid: number;
  reimbursed: number;
  selfMedication: number;
  mode: 'auto' | 'medical' | 'selfMedication';
}

export interface SpouseInput {
  totalIncome: number; // 配偶者の合計所得金額
  isElderly?: boolean; // 70歳以上（老人控除対象配偶者）
}

export interface Dependent {
  id: string;
  age: number; // 特定扶養(19-22歳)判定に使う
  isCoresidentElderlyParent?: boolean; // 同居老親等
}

export interface DisabilityInput {
  severity: 'general' | 'special' | 'specialCoresident';
}

export interface DeductionInput {
  socialInsuranceOverride?: number;
  lifeInsurance: LifeInsuranceInput;
  earthquakeInsurance: { long: number; short: number };
  medical: MedicalInput;
  ideco: number;
  spouse?: SpouseInput;
  dependents: Dependent[];
  isSingleParent: boolean;
  disabilityDeductions: DisabilityInput[];
}

export interface DeductionBreakdown {
  basic: Yen;
  socialInsurance: Yen;
  lifeInsurance: Yen;
  earthquakeInsurance: Yen;
  medical: Yen;
  ideco: Yen;
  spouse: Yen;
  dependents: Yen;
  disability: Yen;
  singleParent: Yen;
  donation: Yen; // 住民税側では常に0（税額控除のため）
  total: Yen;
}

// ---------------------------------------------------------------------------
// 住宅ローン控除
// ---------------------------------------------------------------------------

export interface HousingLoanInput {
  moveInYear: number;
  years: number;
  rate: number;
  yearEndBalance: number;
  borrowingCap: number;
  residentTaxCapRule: 'rule5pct97500' | 'rule7pct136500';
}

// ---------------------------------------------------------------------------
// ふるさと納税
// ---------------------------------------------------------------------------

/** FR-21: 実際に寄附した自治体・金額・日付の記録 */
export interface DonationRecord {
  id: string;
  municipalityName: string;
  amount: number;
  date: string; // 'YYYY-MM-DD'
}

export interface FurusatoInput {
  method: 'oneStop' | 'taxReturn';
  donatedAmount: number;
  safetyRatio: number;
  /** donatedAmountはこの配列の合計から導出する(store.recordDonation/removeDonation参照)。単一の実績値を
   *  別途手入力する経路は設けない(合計と内訳が食い違う状態を作らないため) */
  donations: DonationRecord[];
}

// ---------------------------------------------------------------------------
// 自治体設定
// ---------------------------------------------------------------------------

export interface MunicipalityConfig {
  name: string;
  prefectureName: string;
  municipalIncomeRate: number;
  prefecturalIncomeRate: number;
  municipalPerCapita: number;
  prefecturalPerCapita: number;
  forestTax: number;
  useStandardRateForFurusato: boolean;
}

// ---------------------------------------------------------------------------
// 検算モード
// ---------------------------------------------------------------------------

export interface ActualValues {
  source: 'withholding' | 'residentTaxNotice' | 'taxReturn';
  incomeTaxTotal?: number;
  residentIncomeLevy?: number;
  residentPerCapita?: number;
  housingLoanUsedIncomeTax?: number;
  housingLoanUsedResident?: number;
  note?: string;
}

// ---------------------------------------------------------------------------
// 年度プロファイル
// ---------------------------------------------------------------------------

export interface YearProfile {
  year: number;
  municipality: MunicipalityConfig;
  income: IncomeInput;
  deductions: DeductionInput;
  housingLoan?: HousingLoanInput;
  furusato: FurusatoInput;
  actuals?: ActualValues;
}

// ---------------------------------------------------------------------------
// 単一ケースの税額計算結果 (03詳細設計書§3.9)
// ---------------------------------------------------------------------------

export interface TaxSnapshot {
  income: CalculationResult['income'];
  incomeTax: CalculationResult['incomeTax'];
  residentTax: CalculationResult['residentTax'];
  housingLoan: CalculationResult['housingLoan'];
  marginalRate: number;
  furusato: { basicCredit: Yen; specialCredit: Yen; specialCapReached: boolean };
  trace: TraceStep[];
}

// ---------------------------------------------------------------------------
// 警告
// ---------------------------------------------------------------------------

export interface Warning {
  id: 'W-01' | 'W-02' | 'W-03' | 'W-04' | 'W-05' | 'W-06' | 'W-07' | 'W-08';
  severity: 'info' | 'caution' | 'critical';
  messageKey: string;
  params?: Record<string, number | string>;
}

// ---------------------------------------------------------------------------
// 計算結果 (02仕様書§2.3)
// ---------------------------------------------------------------------------

export interface CalculationResult {
  income: {
    grossTotal: Yen;
    salaryDeduction: Yen;
    salaryIncome: Yen;
    totalIncome: Yen;
    nonTaxableBenefits: Yen;
  };
  incomeTax: {
    deductions: DeductionBreakdown;
    taxableIncome: Yen;
    marginalRate: number;
    calculatedTax: Yen;
    housingLoanApplied: Yen;
    taxAfterCredits: Yen;
    reconstructionTax: Yen;
    total: Yen;
  };
  residentTax: {
    deductions: DeductionBreakdown;
    taxableIncome: Yen;
    incomeLevyBeforeAdj: Yen;
    adjustmentCredit: Yen;
    /** 調整控除後・税額控除前の所得割額。自治体の実効税率(超過課税込み)で計算した額 */
    incomeLevy: Yen;
    /** ふるさと納税 特例分の20%枠の基準となる所得割額。
     *  MunicipalityConfig.useStandardRateForFurusatoがtrueなら標準税率10%で算出する(02仕様書§2.2) */
    incomeLevyForFurusatoCap: Yen;
    furusatoCreditBasic: Yen;
    furusatoCreditSpecial: Yen;
    housingLoanApplied: Yen;
    incomeLevyFinal: Yen;
    perCapitaLevy: Yen;
    total: Yen;
  };
  housingLoan: {
    creditAvailable: Yen;
    usedInIncomeTax: Yen;
    carriedToResidentTax: Yen;
    residentTaxCap: Yen;
    wasted: Yen;
  };
  furusato: {
    limitAmount: Yen;
    recommendedAmount: Yen;
    approxByFormula: Yen;
    breakdown: {
      donation: Yen;
      incomeTaxReduction: Yen;
      residentBasic: Yen;
      residentSpecial: Yen;
      selfBurden: Yen;
    };
    specialCapReached: boolean;
  };
  warnings: Warning[];
  trace: TraceStep[];
}
