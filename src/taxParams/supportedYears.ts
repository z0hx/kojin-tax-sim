/**
 * 税制パラメータJSON(public/taxParams/{year}.json)を収録している年分。
 *
 * この配列とファイルの実体が一致していることは`__tests__/paramFiles.test.ts`が検証する
 * (新しい年分を追加したときの更新漏れを`npm run test`で捕まえる。README「税制パラメータの追加・更新」参照)。
 *
 * 年度データを作成できる年分をこの一覧に限る理由(Issue #49): パラメータが無い年分のプロファイルは
 * 計算不能(03詳細設計書§8のfail closed)であり、作れても検算にもシミュレーションにも使えないため。
 */
export const SUPPORTED_TAX_YEARS: readonly number[] = [2025, 2026];

export function isSupportedTaxYear(year: number): boolean {
  return SUPPORTED_TAX_YEARS.includes(year);
}

/** 収録している最新の年分。年度データを作成するUIの既定値に使う */
export function latestSupportedTaxYear(): number {
  return Math.max(...SUPPORTED_TAX_YEARS);
}
