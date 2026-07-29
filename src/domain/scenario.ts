import { buildCalculationResult } from './engine';
import { findFurusatoLimit } from './furusato';
import { monthsInRange, resolveMonthlySocialInsurance } from './income';
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
        nonLeaveMonths.length > 0
          ? Math.round(nonLeaveMonths.reduce((s, m) => s + resolveMonthlySocialInsurance(m), 0) / nonLeaveMonths.length)
          : 0;

      const freedSet = new Set(freedMonths);
      const monthly = profile.income.monthly.map((rec) => {
        // 解放される月でも、すでに0円以外の給与が記録されている場合はユーザーが実際に入力した
        // 値を優先し上書きしない(実装後レビュー対応: 育休期間追加より前に年間の見込みを
        // 埋めていたようなケースで、既存データを平均値で消してしまわないようにする)。
        if (freedSet.has(rec.month) && rec.grossSalary === 0 && resolveMonthlySocialInsurance(rec) === 0) {
          // 平均値は月をまたいだ見込み額であり内訳に分解できないため、一括入力として入れる(Issue #48)
          return {
            ...rec,
            grossSalary: avgGross,
            socialInsurance: avgSocial,
            socialInsuranceInputMode: 'total' as const,
            socialInsuranceBreakdown: undefined,
            status: 'estimated' as const,
            isSocialInsuranceExempt: false,
          };
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

/** FR-22複数年最適化(03詳細設計書§3.11)。対象年(例: 今年・来年)のYearProfileと税制パラメータ */
export interface MultiYearAllocationInput {
  /** 対象年のYearProfile。各年のfurusato.donatedAmountの合計が、配分し直す寄附予定額の総額になる */
  profiles: YearProfile[];
  paramsByYear: Record<number, TaxParams>;
}

export interface MultiYearAllocation {
  years: number[];
  perYearLimit: Yen[];
  /** 各年に配分する推奨寄附額。合計は入力時点の寄附予定額の合計(各年donatedAmountの合計)と等しい */
  suggestedDonation: Yen[];
  rationale: string;
}

/**
 * 複数年にまたがる寄附額の配分を最適化する(FR-22)。
 *
 * 自己負担額は寄附額が各年の上限以下である限りほぼ一定(≈2,000円)で、寄附する年数が増えるごとに
 * その固定額が積み増される(02仕様書§4.2)。そのため、寄附予定額の合計(Σ各年のdonatedAmount)を
 * 変えずに済むなら、上限額の大きい年から順に埋めて「寄附する年数」自体を減らすほうが総自己負担を
 * 抑えられる。上限額の合計を寄附予定額が上回る場合のみ、超過分をやむを得ず他の年へ振り分ける
 * (上限を超えた寄附の自己負担増加率はどの年でも同じため、按分先による有利不利は生じない)。
 */
export function optimizeAcrossYears(input: MultiYearAllocationInput): MultiYearAllocation {
  const { profiles, paramsByYear } = input;
  const years = profiles.map((p) => p.year);
  const limits = profiles.map((p) => findFurusatoLimit(p, paramsByYear[p.year], 'standard').limit);
  const totalBudget = profiles.reduce((sum, p) => sum + p.furusato.donatedAmount, 0) as Yen;

  if (years.length === 0) {
    return { years, perYearLimit: limits, suggestedDonation: [], rationale: buildAllocationRationale(years, limits, [], totalBudget, 0) };
  }

  // 上限額が大きい年から順に埋める(topIdxを最優先で埋め切ってから、次に大きい年に回す)。
  // 全年の上限を使い切ってなお残る分だけ、最も上限額が大きい年(topIdx)に積む(上限を超えた寄附の
  // 自己負担増加率はどの年でも同じため、超過分をどの年に積んでも有利不利は無い)。
  const [topIdx, ...restIdx] = years.map((_, i) => i).sort((a, b) => limits[b] - limits[a]);

  const suggestedDonation: Yen[] = years.map(() => 0 as Yen);
  let remaining = totalBudget as number;
  const topAlloc = Math.min(remaining, limits[topIdx]);
  suggestedDonation[topIdx] = topAlloc as Yen;
  remaining -= topAlloc;
  for (const idx of restIdx) {
    const alloc = Math.min(remaining, limits[idx]);
    suggestedDonation[idx] = alloc as Yen;
    remaining -= alloc;
  }
  if (remaining > 0) {
    suggestedDonation[topIdx] = (suggestedDonation[topIdx] + remaining) as Yen;
  }

  return {
    years,
    perYearLimit: limits,
    suggestedDonation,
    rationale: buildAllocationRationale(years, limits, suggestedDonation, totalBudget, topIdx),
  };
}

function buildAllocationRationale(years: number[], limits: Yen[], suggested: Yen[], totalBudget: Yen, primaryIdx: number): string {
  if (years.length === 0) return '対象年がありません。';
  if (totalBudget === 0) return '寄附予定額がまだ設定されていないため、配分の提案はありません。寄附実績を記録すると表示されます。';

  const totalLimit = limits.reduce((s, l) => s + l, 0) as Yen;
  const skippedYears = years.filter((_, i) => i !== primaryIdx && suggested[i] === 0 && limits[i] > 0);

  let text = `寄附予定額の合計${totalBudget.toLocaleString()}円のうち、上限額が最も大きい${years[primaryIdx]}年分(上限${limits[
    primaryIdx
  ].toLocaleString()}円)を優先し、${suggested[primaryIdx].toLocaleString()}円を配分することをおすすめします。`;

  if (skippedYears.length > 0) {
    text += `${skippedYears.join('・')}年分への寄附を控えることで、自己負担(寄附する年ごとに概ね2,000円)が発生する年数を減らせます。`;
  }

  if (totalBudget > totalLimit) {
    text += `寄附予定額が対象年の上限合計(${totalLimit.toLocaleString()}円)を超えているため、超過分(${(totalBudget - totalLimit).toLocaleString()}円)は上限超過の寄附として自己負担が増加します。`;
  }

  return text;
}
