import type { Warning } from '../domain/types';

/**
 * Warning.messageKey → 日本語文言の変換(03詳細設計書§3.8: WarningはmessageKeyのみ持ち、文言解決はUI層の責務)。
 * 警告文言はこの関数に一本化する。W-04のようにダッシュボードの警告一覧と個別の入力フォーム
 * (MedicalDeductionForm)の両方に出る文言があり、各所に直書きすると内容がドリフトするため。
 */
export function resolveWarningMessage(warning: Pick<Warning, 'messageKey' | 'params'>): string {
  const p = warning.params ?? {};
  switch (warning.messageKey) {
    case 'warning.housingLoanZeroesIncomeTax':
      return '住宅ローン控除により所得税額が0円になり、控除しきれない分が生じています。';
    case 'warning.housingLoanWasted':
      return `住宅ローン控除のうち￥${Number(p.wasted).toLocaleString()}が控除しきれず切り捨てになる見込みです。`;
    case 'warning.donationIncreasesWasted':
      return `寄附により住宅ローン控除の切り捨てが￥${Number(p.before).toLocaleString()}から￥${Number(p.after).toLocaleString()}へ増加します。`;
    case 'warning.oneStopInvalidWithMedical':
      return '医療費控除があるためワンストップ特例は利用できません(確定申告が必要です)。';
    case 'warning.incomeLevyZero':
      return '住民税所得割が非課税のため、ふるさと納税による軽減効果がありません。';
    case 'warning.lowConfidence':
      return `収入の確定率が${Math.round(Number(p.confidenceRatio) * 100)}%と低いため、上限額の精度が低い可能性があります。`;
    case 'warning.specialCapReached':
      return '寄附金税額控除の特例分が住民税所得割の20%上限に達しています。';
    case 'warning.housingLoanYearEndAdjustmentReminder':
      return '住宅ローン控除は年末調整または確定申告での手続きが必要です。忘れずに行ってください。';
    default:
      return warning.messageKey;
  }
}
