function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateJa(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 端末のローカル日付を'YYYY-MM-DD'で返す(日付入力欄の既定値等に使う) */
export function todayIso(): string {
  return formatDateJa(new Date().toISOString());
}

export function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

/**
 * 'YYYY-MM-DD'(日付のみ)をローカル日付として解釈する。
 * `new Date('2027-01-10')`は同じ文字列をUTC深夜として解釈するため、JSTでは実際の日付より
 * 約9時間後ろにずれる。日付のみの値をISO日時前提の関数に渡さないよう、この経路を用意する。
 */
export function parseDateOnly(dateOnly: string): Date {
  const [y, m, d] = dateOnly.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/**
 * 日付のみで表された期日を、端末のローカル日付で過ぎているかを判定する。
 * 期日当日は「過ぎていない」とする(ワンストップ特例の「翌年1月10日必着」のような必着の締切に合わせる)。
 */
export function isDateOnlyPast(dateOnly: string, now: Date = new Date()): boolean {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return today.getTime() > parseDateOnly(dateOnly).getTime();
}

/** 日付のみで表された日からの経過日数。ローカル日付同士の差のため、夏時間のある地域でも1日単位で数えられるよう丸める */
export function daysSinceDateOnly(dateOnly: string, now: Date = new Date()): number {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today.getTime() - parseDateOnly(dateOnly).getTime()) / 86_400_000);
}
