import params2025 from '../../../public/taxParams/2025.json';
import params2026 from '../../../public/taxParams/2026.json';
import type { TaxParams } from '../../taxParams/schema';
import type { IncomeInput, MonthlyRecord, MunicipalityConfig, YearProfile } from '../types';

export const TAX_PARAMS_2025 = params2025 as unknown as TaxParams;
export const TAX_PARAMS_2026 = params2026 as unknown as TaxParams;

export function monthlyAllYear(grossSalary: number, socialInsurance: number): MonthlyRecord[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    status: 'actual' as const,
    grossSalary,
    socialInsurance,
    isSocialInsuranceExempt: false,
  }));
}

export function emptyIncome(): IncomeInput {
  return {
    monthly: monthlyAllYear(0, 0),
    bonuses: [],
    leavePeriods: [],
    otherSalaryIncome: 0,
  };
}

export function yokohamaMunicipality(): MunicipalityConfig {
  return {
    name: '横浜市',
    prefectureName: '神奈川県',
    municipalIncomeRate: 0.06,
    prefecturalIncomeRate: 0.04025,
    municipalPerCapita: 3900,
    prefecturalPerCapita: 1000,
    forestTax: 1000,
    useStandardRateForFurusato: true,
  };
}

export function makeProfile(overrides: Partial<YearProfile> = {}): YearProfile {
  return {
    year: 2026,
    municipality: yokohamaMunicipality(),
    income: emptyIncome(),
    deductions: {
      lifeInsurance: {
        new: { general: 0, nursing: 0, pension: 0 },
        old: { general: 0, pension: 0 },
        hasChildUnder23: false,
      },
      earthquakeInsurance: { long: 0, short: 0 },
      medical: { paid: 0, reimbursed: 0, selfMedication: 0, mode: 'auto' },
      ideco: 0,
      dependents: [],
      isSingleParent: false,
      disabilityDeductions: [],
    },
    furusato: { method: 'oneStop', donatedAmount: 0, safetyRatio: 0.9 },
    ...overrides,
  };
}

/**
 * M1モデルケース(03詳細設計書§10.2)。給与収入500万・社保75万・生保新規一般(所得税4万/住民税2.8万相当)・住宅ローン控除ケース。
 * 月次按分の端数を避けるため、収入はotherSalaryIncome・社保はsocialInsuranceOverrideで指定する。
 */
export function makeM1Profile(yearEndBalance: number, borrowingCap = 40_000_000): YearProfile {
  return makeProfile({
    income: {
      monthly: monthlyAllYear(0, 0),
      bonuses: [],
      leavePeriods: [],
      otherSalaryIncome: 5_000_000,
    },
    deductions: {
      socialInsuranceOverride: 750_000,
      lifeInsurance: {
        new: { general: 80_000, nursing: 0, pension: 0 },
        old: { general: 0, pension: 0 },
        hasChildUnder23: false,
      },
      earthquakeInsurance: { long: 0, short: 0 },
      medical: { paid: 0, reimbursed: 0, selfMedication: 0, mode: 'auto' },
      ideco: 0,
      dependents: [],
      isSingleParent: false,
      disabilityDeductions: [],
    },
    housingLoan: {
      moveInYear: 2023,
      years: 13,
      rate: 0.007,
      yearEndBalance,
      borrowingCap,
      residentTaxCapRule: 'rule5pct97500',
    },
  });
}
