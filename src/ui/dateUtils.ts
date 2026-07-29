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
