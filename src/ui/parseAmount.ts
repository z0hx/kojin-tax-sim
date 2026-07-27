/** フォーム入力欄共通の整数バリデーション。0以上の整数以外はnullを返す(呼び出し側で無視する)。 */
export function parseNonNegativeInt(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * パーセント表示のフォーム入力(例: "0.7")を小数の比率(0.007)に変換する。
 * 0.7/100のような単純な除算は浮動小数点誤差(0.006999999999999999)を生むため、
 * 小数点以下6桁(比率にして0.0001%単位)に丸める。0以上でない場合や不正な入力はnullを返す。
 */
export function parsePercentToRate(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0) return null;
  return Number((n / 100).toFixed(6));
}

/** 比率(0.007)をパーセント表示用の文字列("0.7")に変換する。表示専用で丸め誤差の桁を落とす。 */
export function formatRateAsPercent(rate: number): string {
  return String(Number((rate * 100).toFixed(4)));
}
