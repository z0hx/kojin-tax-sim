import { buildCalculationResult } from '../domain/engine';
import type { YearProfile } from '../domain/types';
import type { AppData, Person } from '../persistence/types';
import type { TaxParams } from '../taxParams/schema';

/**
 * store/selectors.ts: AppStoreStateから派生する読み取り専用の値。
 * 副作用(fetch等)は行わず、既にキャッシュ済みのtaxParamsのみを使う純粋関数として実装する
 * (selectorはZustandのstateから同期的に計算できる値のみを返す)。
 */

interface ActivePersonInput {
  appData: AppData | null;
  activePersonId: string | null;
}

interface ActiveYearProfileInput extends ActivePersonInput {
  activeYear: number | null;
}

interface TaxParamsCacheInput {
  appData: AppData | null;
  taxParams: Record<number, TaxParams>;
}

export function selectActivePerson(state: ActivePersonInput): Person | null {
  if (!state.appData || !state.activePersonId) return null;
  return state.appData.persons.find((p) => p.id === state.activePersonId) ?? null;
}

export function selectActiveYearProfile(state: ActiveYearProfileInput): YearProfile | null {
  const person = selectActivePerson(state);
  if (!person || state.activeYear === null) return null;
  return person.years[state.activeYear] ?? null;
}

/** 人物の年度プロファイルを解決する。指定年が無ければその人物の最新年度、それも無ければnull */
function resolveYearProfile(person: Person, preferredYear: number | null): YearProfile | null {
  if (preferredYear !== null && person.years[preferredYear]) return person.years[preferredYear];
  const years = Object.keys(person.years).map(Number);
  if (years.length === 0) return null;
  return person.years[Math.max(...years)];
}

export interface HouseholdSummaryEntry {
  personId: string;
  displayName: string;
  color: string;
  /** false の場合、対象年のYearProfileが無い、またはtaxParamsが未キャッシュのため計算結果が無い */
  available: boolean;
  limitAmount?: number;
  recommendedAmount?: number;
  donated?: number;
  remaining?: number;
  warningCount?: number;
}

/**
 * 世帯合計(FR-29, S-11)の元になる、人物ごとのふるさと納税上限額サマリ。
 * `preferredYear`のプロファイルがあればそれを、無ければ各人物の最新年度を使う。
 * taxParamsが未キャッシュの年はfetchせず(selectorは非同期処理をしない)、available:falseで返す。
 */
export function selectHouseholdSummary(state: TaxParamsCacheInput, preferredYear: number | null): HouseholdSummaryEntry[] {
  if (!state.appData) return [];
  return state.appData.persons.map((person) => {
    const profile = resolveYearProfile(person, preferredYear);
    const params = profile ? state.taxParams[profile.year] : undefined;
    if (!profile || !params) {
      return { personId: person.id, displayName: person.displayName, color: person.color, available: false };
    }
    const result = buildCalculationResult(profile, params);
    return {
      personId: person.id,
      displayName: person.displayName,
      color: person.color,
      available: true,
      limitAmount: result.furusato.limitAmount,
      recommendedAmount: result.furusato.recommendedAmount,
      donated: profile.furusato.donatedAmount,
      remaining: Math.max(0, result.furusato.limitAmount - profile.furusato.donatedAmount),
      warningCount: result.warnings.length,
    };
  });
}

/**
 * 指定した人物の年度プロファイルのうち、税制パラメータが読み込み済み(taxParamsキャッシュに存在する)ものだけを
 * 年度の昇順で返す(FR-22複数年最適化で使用)。読み込みに失敗・未完了の年は除外し、一部の年が読めないだけで
 * 機能全体を止めないようにする(selectorはfetchを行わないため、未キャッシュの年はそのまま除外する)。
 */
export function selectEligibleYearProfiles(state: TaxParamsCacheInput, personId: string): YearProfile[] {
  const person = state.appData?.persons.find((p) => p.id === personId);
  if (!person) return [];
  return Object.values(person.years)
    .filter((p) => Boolean(state.taxParams[p.year]))
    .sort((a, b) => a.year - b.year);
}

/**
 * 配偶者の合計所得金額(FR-29)。配偶者控除判定のために本人プロファイルへ参照連携する用途で使う読み取り専用セレクタ。
 * 実際に本人のSpouseInputへ書き込むアクション(linkSpouseIncome)はIssue #14(世帯ビュー)で追加する。
 * 対象年のYearProfileまたはtaxParamsが無ければnullを返す(fetchはしない)。
 */
export function selectSpouseTotalIncome(state: TaxParamsCacheInput, spouseId: string, year: number): number | null {
  if (!state.appData) return null;
  const spouse = state.appData.persons.find((p) => p.id === spouseId);
  const profile = spouse?.years[year];
  const params = state.taxParams[year];
  if (!profile || !params) return null;
  return buildCalculationResult(profile, params).income.totalIncome;
}
