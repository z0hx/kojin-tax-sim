import { buildCalculationResult } from './engine';
import { monthsInRange } from './income';
import { floorYen, type CalculationResult, type Yen, type YearProfile } from './types';
import type { TaxParams } from '../taxParams/schema';

/** FR-16シナリオ比較・FR-22複数年最適化(03詳細設計書§3.11)。各フィールドは省略可能で、
 *  指定したものだけを基準(base)のYearProfileから変更する。 */
export interface ScenarioOverride {
  label: string;
  /** 復職月を変更する。childcare育休期間のうち開始年月(startYm)が最も早いものの終了年月を
   *  対象年の当該月に置き換える(実装後レビュー対応: 配列の並び順ではなくstartYmの昇順で選ぶ。
   *  LeavePeriodEditorは新規期間を常に配列末尾に追加するため、後から追加された期間が先に
   *  始まっている、という並びが実際に起こりうる)。育休が複数ある場合、対象外の期間は変更しない。 */
  reinstatementMonth?: number;
  /** 賞与額の倍率(査定期間の育休による減額を模擬)。各賞与のgross・socialInsurance両方に乗算する */
  bonusMultiplier?: number;
  /** 医療費(支払額)への追加額 */
  additionalMedicalExpense?: Yen;
  /** 寄附額(donatedAmount)を指定額で上書きする */
  donationAmountOverride?: Yen;
}

function ymToNumber(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + m;
}

/**
 * ScenarioOverrideの内容でYearProfileを変更した新しいYearProfileを返す(純粋関数、baseは変更しない)。
 * 指定されなかったフィールドは基準の値をそのまま使う。
 */
export function applyScenarioOverride(base: YearProfile, override: ScenarioOverride): YearProfile {
  let profile = base;

  if (override.reinstatementMonth !== undefined) {
    const childcarePeriods = profile.income.leavePeriods.filter((lp) => lp.type === 'childcare');
    if (childcarePeriods.length > 0) {
      // startYmが最も早い育休期間を対象にする(実装後レビュー対応: 配列順ではなく日付順で選ぶ)
      const target = childcarePeriods.reduce((earliest, lp) => (ymToNumber(lp.startYm) < ymToNumber(earliest.startYm) ? lp : earliest));
      const targetIdx = profile.income.leavePeriods.indexOf(target);

      const oldTargetMonths = new Set(monthsInRange(target.startYm, target.endYm, profile.year));

      // 指定月が育休開始より前になる(終了年月が開始年月より前になる)場合、月範囲が反転して
      // monthsInRangeが空を返し、育休自体が消滅してしまう。開始年月を下限としてクランプする
      // (実装後レビュー対応)。
      const targetYm = `${profile.year}-${String(override.reinstatementMonth).padStart(2, '0')}`;
      const newEndYm = ymToNumber(targetYm) < ymToNumber(target.startYm) ? target.startYm : targetYm;

      const newLeavePeriods = profile.income.leavePeriods.map((lp, i) => (i === targetIdx ? { ...lp, endYm: newEndYm } : lp));
      const newTargetMonths = new Set(monthsInRange(target.startYm, newEndYm, profile.year));

      // 対象の育休期間から新たに外れる月(復職を早めて働くことになった月)を求める。ただし他の
      // 育休期間(産休・別の育休等)にまだ該当する月は除く(実装後レビュー対応: 産休→育休のように
      // 連続する期間がある実プロファイルで、対象外の期間の月まで「就労月」扱いにしないため)。
      const otherPeriods = profile.income.leavePeriods.filter((_, i) => i !== targetIdx);
      const otherExemptMonths = new Set(otherPeriods.flatMap((lp) => monthsInRange(lp.startYm, lp.endYm, profile.year)));
      const freedMonths = [...oldTargetMonths].filter((m) => !newTargetMonths.has(m) && !otherExemptMonths.has(m));

      // 育休期間全体(全種別)を除いた月の平均給与を、新たに就労月になる月の見込みとして補う。
      // 何もしないと「復職月を早めた」のに給与が0円のままという、UIが常に育休対象月の給与を
      // 0円に強制していることに起因する矛盾した結果になる(実装後レビュー対応: Issue #6の
      // MonthlyIncomeGridは育休対象月の入力を無効化し0円に固定するため、育休期間を縮めるだけでは
      // 「隠れていた実際の給与」が現れるわけではない)。
      const allExemptMonths = new Set(profile.income.leavePeriods.flatMap((lp) => monthsInRange(lp.startYm, lp.endYm, profile.year)));
      const nonLeaveMonths = profile.income.monthly.filter((m) => !allExemptMonths.has(m.month));
      const avgGross = nonLeaveMonths.length > 0 ? Math.round(nonLeaveMonths.reduce((s, m) => s + m.grossSalary, 0) / nonLeaveMonths.length) : 0;
      const avgSocial =
        nonLeaveMonths.length > 0 ? Math.round(nonLeaveMonths.reduce((s, m) => s + m.socialInsurance, 0) / nonLeaveMonths.length) : 0;

      const freedSet = new Set(freedMonths);
      const monthly = profile.income.monthly.map((rec) => {
        // 解放される月でも、すでに0円以外の給与が記録されている場合はユーザーが実際に入力した
        // 値を優先し上書きしない(実装後レビュー対応: 育休期間追加より前に年間の見込みを
        // 埋めていたようなケースで、既存データを平均値で消してしまわないようにする)。
        if (freedSet.has(rec.month) && rec.grossSalary === 0 && rec.socialInsurance === 0) {
          return { ...rec, grossSalary: avgGross, socialInsurance: avgSocial, status: 'estimated' as const, isSocialInsuranceExempt: false };
        }
        return rec;
      });

      profile = { ...profile, income: { ...profile.income, monthly, leavePeriods: newLeavePeriods } };
    }
  }

  if (override.bonusMultiplier !== undefined) {
    const multiplier = override.bonusMultiplier;
    profile = {
      ...profile,
      income: {
        ...profile.income,
        bonuses: profile.income.bonuses.map((b) => ({
          ...b,
          gross: floorYen(b.gross * multiplier),
          socialInsurance: floorYen(b.socialInsurance * multiplier),
        })),
      },
    };
  }

  if (override.additionalMedicalExpense !== undefined) {
    profile = {
      ...profile,
      deductions: {
        ...profile.deductions,
        medical: { ...profile.deductions.medical, paid: profile.deductions.medical.paid + override.additionalMedicalExpense },
      },
    };
  }

  if (override.donationAmountOverride !== undefined) {
    profile = { ...profile, furusato: { ...profile.furusato, donatedAmount: override.donationAmountOverride } };
  }

  return profile;
}

/** overrideを適用したYearProfileでCalculationResultを計算する(純粋関数)。 */
export function runScenario(base: YearProfile, override: ScenarioOverride, params: TaxParams): CalculationResult {
  const profile = applyScenarioOverride(base, override);
  return buildCalculationResult(profile, params);
}

export interface ScenarioComparisonRow {
  label: string;
  limitAmount: Yen;
  diffFromBase: Yen;
}

/** 基準(baseResult)と各シナリオの結果を、上限額と基準との差額で並べた比較表データを作る。 */
export function compareScenarios(
  baseResult: CalculationResult,
  variants: { override: ScenarioOverride; result: CalculationResult }[]
): ScenarioComparisonRow[] {
  return variants.map(({ override, result }) => ({
    label: override.label,
    limitAmount: result.furusato.limitAmount,
    diffFromBase: (result.furusato.limitAmount - baseResult.furusato.limitAmount) as Yen,
  }));
}
