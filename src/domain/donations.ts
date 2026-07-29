import { requiresConfirmedFiling } from './warnings';
import type { DonationRecord, FurusatoInput, YearProfile } from './types';

/** ワンストップ特例制度の対象となる寄附先の上限自治体数(総務省の制度上の条件) */
export const ONE_STOP_MAX_MUNICIPALITIES = 5;

export function sumDonations(donations: DonationRecord[]): number {
  return donations.reduce((sum, d) => sum + d.amount, 0);
}

/** ワンストップ特例申請書の提出期限(寄附翌年1月10日必着)。ISO日付文字列(YYYY-MM-DD)で返す */
export function oneStopDeadline(year: number): string {
  return `${year + 1}-01-10`;
}

/**
 * furusato.donationsを差し替え、donatedAmountを合計額へ再計算した新しいFurusatoInputを返す。
 * 「donationsが変わったらdonatedAmountを合計額にする」という不変条件をここに集約する
 * (store.recordDonation/removeDonationの両方から呼ぶことで、実装漏れによるドリフトを防ぐ)。
 */
export function withDonations(furusato: FurusatoInput, donations: DonationRecord[]): FurusatoInput {
  return { ...furusato, donations, donatedAmount: sumDonations(donations) };
}

export interface OneStopEligibility {
  eligible: boolean;
  deadline: string;
  reason?: string;
}

/**
 * ワンストップ特例が利用できるかを判定する(FR-21、FR-14と連動)。
 * - 医療費控除の入力がある場合は確定申告が必要になるため利用不可(FR-14・W-04と同じ条件)
 * - 住宅ローン控除の初年度(入居年)も、給与所得者であっても確定申告が必要になるため利用不可
 * - 寄附先が5自治体を超える場合も制度上利用不可
 */
export function evaluateOneStopEligibility(profile: YearProfile): OneStopEligibility {
  const deadline = oneStopDeadline(profile.year);
  if (requiresConfirmedFiling(profile)) {
    return { eligible: false, deadline, reason: '医療費控除の入力があり確定申告が必要なため、ワンストップ特例は利用できません' };
  }
  if (profile.housingLoan && profile.housingLoan.moveInYear === profile.year) {
    return { eligible: false, deadline, reason: '住宅ローン控除の初年度は確定申告が必要なため、ワンストップ特例は利用できません' };
  }
  const municipalityCount = new Set(profile.furusato.donations.map((d) => d.municipalityName.trim())).size;
  if (municipalityCount > ONE_STOP_MAX_MUNICIPALITIES) {
    return {
      eligible: false,
      deadline,
      reason: `寄附先が${municipalityCount}自治体あり、ワンストップ特例の対象(5自治体以内)を超えているため利用できません。確定申告が必要です`,
    };
  }
  return { eligible: true, deadline };
}
