/** フォーム入力欄共通の整数バリデーション。0以上の整数以外はnullを返す(呼び出し側で無視する)。 */
export function parseNonNegativeInt(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}
