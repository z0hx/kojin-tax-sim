import type { SalaryDeductionTable } from '../taxParams/schema';
import { type Bonus, type IncomeInput, type LeavePeriod, floorYen, type Yen } from './types';

function ymToNumber(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + m;
}

/** 対象年のうち、育休等の期間に含まれる月(1-12)の配列を返す */
export function monthsInRange(startYm: string, endYm: string, year: number): number[] {
  const start = ymToNumber(startYm);
  const end = ymToNumber(endYm);
  const months: number[] = [];
  for (let month = 1; month <= 12; month++) {
    const ym = year * 12 + month;
    if (ym >= start && ym <= end) months.push(month);
  }
  return months;
}

/** 育休等の期間が2ヶ月以上に及ぶか(賞与の社保免除判定に使う) */
function isLongLeave(leave: LeavePeriod): boolean {
  return ymToNumber(leave.endYm) - ymToNumber(leave.startYm) >= 1;
}

export function isBonusExempt(bonus: Bonus, leaves: LeavePeriod[], year: number): boolean {
  return leaves.some((leave) => isLongLeave(leave) && monthsInRange(leave.startYm, leave.endYm, year).includes(bonus.month));
}

/**
 * 育休・産休等の期間を月次収入に反映した新しいIncomeInputを返す(純粋関数)。
 * 対象月のgrossSalary/socialInsuranceを0にし、isSocialInsuranceExemptをtrueにする。
 * 賞与についてもisExemptを再計算する。
 */
export function applyLeavePeriods(income: IncomeInput, year: number): IncomeInput {
  const exemptMonths = new Set<number>();
  for (const leave of income.leavePeriods) {
    for (const m of monthsInRange(leave.startYm, leave.endYm, year)) exemptMonths.add(m);
  }

  const monthly = income.monthly.map((rec) =>
    exemptMonths.has(rec.month)
      ? { ...rec, grossSalary: 0, socialInsurance: 0, isSocialInsuranceExempt: true }
      : { ...rec }
  );

  const bonuses = income.bonuses.map((bonus) => ({
    ...bonus,
    isExempt: isBonusExempt(bonus, income.leavePeriods, year),
  }));

  return { ...income, monthly, bonuses };
}

export function sumMonthlySalary(income: IncomeInput): Yen {
  return income.monthly.reduce((sum, rec) => sum + rec.grossSalary, 0) as Yen;
}

export function sumMonthlySocialInsurance(income: IncomeInput): Yen {
  return income.monthly.reduce((sum, rec) => sum + rec.socialInsurance, 0) as Yen;
}

export function sumBonuses(income: IncomeInput): Yen {
  return income.bonuses.reduce((sum, b) => sum + b.gross, 0) as Yen;
}

export function sumBonusSocialInsurance(income: IncomeInput): Yen {
  return income.bonuses.reduce((sum, b) => sum + (b.isExempt ? 0 : b.socialInsurance), 0) as Yen;
}

export function calcGrossIncome(income: IncomeInput): Yen {
  return (sumMonthlySalary(income) + sumBonuses(income) + income.otherSalaryIncome) as Yen;
}

export function sumNonTaxableBenefits(income: IncomeInput): Yen {
  return income.leavePeriods.reduce((sum, l) => sum + l.benefitAmount, 0) as Yen;
}

export function calcSalaryDeduction(gross: Yen, table: SalaryDeductionTable): Yen {
  const bracket = table.brackets.find((b) => b.upTo === null || gross <= b.upTo) ?? table.brackets[table.brackets.length - 1];
  const formulaValue = Math.max(0, gross * bracket.rate + bracket.addend);

  let minimum = table.minimumGuarantee;
  if (table.lowIncomeSpecialMeasure && gross <= table.lowIncomeSpecialMeasure.incomeThreshold) {
    minimum = table.lowIncomeSpecialMeasure.minimumGuarantee;
  }

  return floorYen(Math.min(gross, Math.max(formulaValue, minimum)));
}

export function calcSalaryIncome(gross: Yen, table: SalaryDeductionTable): Yen {
  return Math.max(0, gross - calcSalaryDeduction(gross, table)) as Yen;
}

export interface EstimationParams {
  fillMode: 'lastActual' | 'average';
}

export interface IncomeEstimate {
  filledIncome: IncomeInput;
  confidenceRatio: number; // 実績月数 / 12。W-06判定に使う
}

/** FR-03: 実績月から見込み月を埋め、確定率を算出する */
export function estimateAnnualIncome(income: IncomeInput, params: EstimationParams): IncomeEstimate {
  const actualMonths = income.monthly.filter((m) => m.status === 'actual');
  const confidenceRatio = actualMonths.length / 12;

  if (actualMonths.length === 0) {
    return { filledIncome: income, confidenceRatio };
  }

  const lastActual = actualMonths[actualMonths.length - 1];
  const averageGross = actualMonths.reduce((s, m) => s + m.grossSalary, 0) / actualMonths.length;
  const averageSocial = actualMonths.reduce((s, m) => s + m.socialInsurance, 0) / actualMonths.length;

  const monthly = income.monthly.map((rec) => {
    if (rec.status === 'actual') return rec;
    const fillFrom = params.fillMode === 'lastActual' ? lastActual : { grossSalary: averageGross, socialInsurance: averageSocial };
    return {
      ...rec,
      grossSalary: Math.round(fillFrom.grossSalary),
      socialInsurance: Math.round(fillFrom.socialInsurance),
    };
  });

  return { filledIncome: { ...income, monthly }, confidenceRatio };
}
