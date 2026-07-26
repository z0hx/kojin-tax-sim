/**
 * 税制パラメータの型定義。03詳細設計書§3、02仕様書§3に対応する。
 * すべて年分ごとのJSON (public/taxParams/{year}.json) から読み込む。
 */

export interface Bracket {
  upTo: number | null; // 上限。nullは上限なし(最終区分)
  rate: number;
  addend: number;
}

export interface AmountBracket {
  upTo: number | null;
  amount: number;
}

export interface InsuranceBracketTable {
  brackets: Bracket[];
}

export interface LifeInsuranceTable {
  newGeneral: InsuranceBracketTable;
  newNursing: InsuranceBracketTable;
  newPension: InsuranceBracketTable;
  oldGeneral: InsuranceBracketTable;
  oldPension: InsuranceBracketTable;
  newTotalCap: number;
  /** 令和8年分限定・子育て世帯特例(23歳未満の扶養親族)。要確認パラメータ(03詳細設計書§3.3脚注相当) */
  newGeneralChildUnder23Cap?: number;
}

export interface SalaryDeductionTable {
  minimumGuarantee: number;
  /** 令和8・9年分限定の時限措置。要確認パラメータ */
  lowIncomeSpecialMeasure?: { incomeThreshold: number; minimumGuarantee: number };
  brackets: Bracket[];
}

export interface HumanDeductionAmountTable {
  dependentGeneral: number;
  dependentSpecific: number;
  dependentElderlyCoresident: number;
  dependentElderlyOther: number;
  disabilityGeneral: number;
  disabilitySpecial: number;
  disabilitySpecialCoresident: number;
  singleParent: number;
}

export interface HumanDeductionDiffTable extends HumanDeductionAmountTable {
  basic: number;
}

export interface SpouseSpecialRow {
  /** 配偶者の合計所得金額の上限 */
  spouseIncomeUpTo: number;
  /** 納税者本人の合計所得金額900万円以下の場合の控除額 */
  amount: number;
}

/**
 * 配偶者控除・配偶者特別控除。納税者本人の合計所得金額により3段階(900万/950万/1000万円以下)で
 * 逓減し、900万円超は基準額の2/3、950万円超は1/3(10,000円未満四捨五入)、1,000万円超は0円になる。
 * 900万円超の2/3・1/3段階は基準額からの計算による近似であり、要確認パラメータ。
 */
export interface SpouseDeductionTable {
  regularGeneralBase: number; // 配偶者控除(一般、配偶者の合計所得金額48万円以下)
  regularElderlyBase: number; // 配偶者控除(老人控除対象配偶者、70歳以上)
  special: SpouseSpecialRow[]; // 配偶者特別控除(配偶者の合計所得金額48万円超133万円以下)
  taxpayerIncomeTierThresholds: [number, number]; // [9,000,000, 9,500,000]
  taxpayerIncomeCutoff: number; // 10,000,000。これを超えると全区分0円
}

export interface HousingLoanCapRule {
  ratio: number;
  cap: number;
}

export interface EarthquakeInsuranceTable {
  cap: number; // 地震保険料控除の上限
  oldLongTermCap: number; // 旧長期損害保険料控除の上限(経過措置)
  oldLongTermBracket1: number; // この額以下は旧長期損害保険料の支払額全額を控除
  oldLongTermBracket2: number; // この額以下は ×1/2+定額 の式を適用
  oldLongTermAddend: number; // ×1/2の式に加える定額
  halveMainAmount: boolean; // 住民税は地震保険料(long)を×1/2して計算する
}

export interface TaxParamsMeta {
  sources: string[];
  verifiedAt: string; // 'YYYY-MM-DD'
  notes?: string;
}

export interface TaxParams {
  year: number;
  meta: TaxParamsMeta;
  incomeTax: {
    salaryDeduction: SalaryDeductionTable;
    basicDeduction: AmountBracket[];
    brackets: Bracket[]; // 超過累進税率
    lifeInsurance: LifeInsuranceTable;
    earthquakeInsurance: EarthquakeInsuranceTable;
    humanDeductions: HumanDeductionAmountTable;
    spouseDeduction: SpouseDeductionTable;
    medical: {
      thresholdFixed: number; // 100,000
      thresholdIncomeRatio: number; // 0.05
      cap: number; // 2,000,000
      selfMedicationDeductible: number; // 12,000
      selfMedicationCap: number; // 88,000
    };
    donationDeductionIncomeRatioCap: number; // 0.4
    reconstructionSurtaxRate: number; // 0.021
  };
  residentTax: {
    basicDeduction: AmountBracket[];
    lifeInsurance: LifeInsuranceTable;
    earthquakeInsurance: EarthquakeInsuranceTable;
    humanDeductions: HumanDeductionAmountTable;
    spouseDeduction: SpouseDeductionTable;
    municipalIncomeRateStandard: number; // 0.06
    prefecturalIncomeRateStandard: number; // 0.04
    humanDeductionDiff: HumanDeductionDiffTable;
    adjustmentCreditMinimum: number; // 2,500
    /** 02仕様書§3.3.1: 合計所得金額がこれを超えると調整控除は適用されない(0円になる) */
    adjustmentCreditIncomeCutoff: number; // 25,000,000
    furusatoBasicRate: number; // 0.10
    furusatoIncomeRatioCap: number; // 0.30
    furusatoSpecialCapRatio: number; // 0.20
    housingLoanCapRules: {
      rule5pct97500: HousingLoanCapRule;
      rule7pct136500: HousingLoanCapRule;
    };
    /**
     * 住民税の非課税限度額。所得割と均等割で基準額が異なる(所得割のほうが高い)ため、
     * それぞれ別に判定する。扶養親族がいる場合は
     * `350,000×(本人+扶養人数) + 100,000 + (均等割210,000 / 所得割320,000)` で算出する。
     * 本来は自治体の級地区分(1級地/2級地/3級地)により基準額が異なるが、本アプリでは
     * 級地1相当の値を近似として使う(要確認パラメータ)。
     */
    nonTaxableThreshold: {
      baseNoDependents: number; // 450,000(扶養親族がいない場合、所得割・均等割共通)
      perPersonAmount: number; // 350,000(本人+扶養人数に掛ける単価)
      commonAddition: number; // 100,000(扶養親族がいる場合の共通加算)
      perCapitaAddition: number; // 210,000(扶養親族がいる場合、均等割用の追加加算)
      incomeAddition: number; // 320,000(扶養親族がいる場合、所得割用の追加加算)
    };
  };
}
