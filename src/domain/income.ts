import type { SalaryDeductionTable } from '../taxParams/schema';
import {
  type Bonus,
  type IncomeInput,
  type LeavePeriod,
  type MonthlyRecord,
  floorYen,
  sumSocialInsuranceBreakdown,
  type Yen,
} from './types';

/**
 * Issue #48: その月の社会保険料。内訳入力(socialInsuranceInputMode === 'breakdown')なら内訳の合計、
 * それ以外(既定・既存データ)なら一括入力額を返す。社会保険料を参照する処理はすべてこの関数を通し、
 * 「一括入力額」と「内訳の合計」が食い違う状態でどちらが使われるかを一箇所に閉じる。
 */
export function resolveMonthlySocialInsurance(rec: MonthlyRecord): number {
  if (rec.socialInsuranceInputMode === 'breakdown' && rec.socialInsuranceBreakdown) {
    return sumSocialInsuranceBreakdown(rec.socialInsuranceBreakdown);
  }
  return rec.socialInsurance;
}

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

  // 免除月は内訳入力(Issue #48)であっても社会保険料を0にする。内訳を残したまま一括入力へ倒すのではなく
  // 内訳自体を落とすことで、resolveMonthlySocialInsuranceがどちらのモードでも0を返すことを保証する
  // (この結果は生データへ書き戻さないため、育休期間を編集・削除すれば内訳は元のまま復元される)
  const monthly = income.monthly.map((rec) =>
    exemptMonths.has(rec.month)
      ? {
          ...rec,
          grossSalary: 0,
          socialInsurance: 0,
          isSocialInsuranceExempt: true,
          socialInsuranceInputMode: 'total' as const,
          socialInsuranceBreakdown: undefined,
        }
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
  return income.monthly.reduce((sum, rec) => sum + resolveMonthlySocialInsurance(rec), 0) as Yen;
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
  const averageSocial = actualMonths.reduce((s, m) => s + resolveMonthlySocialInsurance(m), 0) / actualMonths.length;

  const monthly = income.monthly.map((rec) => {
    if (rec.status === 'actual') return rec;
    // Issue #48: 'lastActual'は直近実績月の社会保険料の入力方法(一括/内訳)ごと写す。'average'は
    // 月をまたいだ平均値であり内訳に分解できないため、一括入力の見込み額として入れる
    // (内訳が残っていると合計の方が使われず混乱するので、内訳は落とす)
    if (params.fillMode === 'lastActual') {
      return {
        ...rec,
        grossSalary: Math.round(lastActual.grossSalary),
        socialInsurance: lastActual.socialInsurance,
        socialInsuranceInputMode: lastActual.socialInsuranceInputMode,
        socialInsuranceBreakdown: lastActual.socialInsuranceBreakdown ? { ...lastActual.socialInsuranceBreakdown } : undefined,
      };
    }
    return {
      ...rec,
      grossSalary: Math.round(averageGross),
      socialInsurance: Math.round(averageSocial),
      socialInsuranceInputMode: 'total' as const,
      socialInsuranceBreakdown: undefined,
    };
  });

  return { filledIncome: { ...income, monthly }, confidenceRatio };
}
