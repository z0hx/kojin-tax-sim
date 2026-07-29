import type { FurusatoLimitResult } from './furusato';
import type { IncomeEstimate } from './income';
import { type TaxSnapshot, type Warning, type YearProfile } from './types';

export interface WarningContext {
  snapshotAtZero: TaxSnapshot;
  snapshotAtDonated: TaxSnapshot;
  limitResult: FurusatoLimitResult;
  profile: YearProfile;
  incomeEstimate: IncomeEstimate;
}

export function checkW01(ctx: WarningContext): Warning | null {
  // 「住宅ローン控除により所得税がゼロになった」ことを示す警告のため、
  // 住宅ローン控除が実際に所得税へ適用されたケースに限定する(住宅ローンが無い、または
  // 控除以前から所得税が0円だった場合にまで発火させない。Medium#6是正)。
  if (!ctx.profile.housingLoan) return null;
  if (ctx.snapshotAtZero.housingLoan.usedInIncomeTax <= 0) return null;
  if (ctx.snapshotAtZero.incomeTax.taxAfterCredits !== 0) return null;
  return { id: 'W-01', severity: 'critical', messageKey: 'warning.housingLoanZeroesIncomeTax' };
}

export function checkW02(ctx: WarningContext): Warning | null {
  if (ctx.snapshotAtZero.housingLoan.wasted <= 0) return null;
  return { id: 'W-02', severity: 'caution', messageKey: 'warning.housingLoanWasted', params: { wasted: ctx.snapshotAtZero.housingLoan.wasted } };
}

export function checkW03(ctx: WarningContext): Warning | null {
  if (ctx.snapshotAtDonated.housingLoan.wasted <= ctx.snapshotAtZero.housingLoan.wasted) return null;
  return {
    id: 'W-03',
    severity: 'caution',
    messageKey: 'warning.donationIncreasesWasted',
    params: {
      before: ctx.snapshotAtZero.housingLoan.wasted,
      after: ctx.snapshotAtDonated.housingLoan.wasted,
    },
  };
}

/** 医療費控除の入力がある場合は確定申告が必要になり、ワンストップ特例は無効になる(FR-14)。
 *  checkW04とFR-21(domain/donations.ts)のワンストップ特例可否判定の両方が参照する共通条件 */
export function requiresConfirmedFiling(profile: YearProfile): boolean {
  return profile.deductions.medical.paid > 0;
}

export function checkW04(ctx: WarningContext): Warning | null {
  if (!(requiresConfirmedFiling(ctx.profile) && ctx.profile.furusato.method === 'oneStop')) return null;
  return { id: 'W-04', severity: 'critical', messageKey: 'warning.oneStopInvalidWithMedical' };
}

export function checkW05(ctx: WarningContext): Warning | null {
  if (ctx.snapshotAtZero.residentTax.incomeLevy !== 0) return null;
  return { id: 'W-05', severity: 'critical', messageKey: 'warning.incomeLevyZero' };
}

export function checkW06(ctx: WarningContext): Warning | null {
  if (ctx.incomeEstimate.confidenceRatio >= 0.5) return null;
  return { id: 'W-06', severity: 'caution', messageKey: 'warning.lowConfidence', params: { confidenceRatio: ctx.incomeEstimate.confidenceRatio } };
}

export function checkW07(ctx: WarningContext): Warning | null {
  // 「上限額に到達している」= 利用者が実際に入力した寄附額(snapshotAtDonated)で判定する。
  // 理論上の探索結果(limitResult)ではなく、現在の入力に対する警告であるため。
  if (!ctx.snapshotAtDonated.furusato.specialCapReached) return null;
  return { id: 'W-07', severity: 'info', messageKey: 'warning.specialCapReached' };
}

export function checkW08(ctx: WarningContext): Warning | null {
  if (!ctx.profile.housingLoan) return null;
  return { id: 'W-08', severity: 'info', messageKey: 'warning.housingLoanYearEndAdjustmentReminder' };
}

const CHECKS = [checkW01, checkW02, checkW03, checkW04, checkW05, checkW06, checkW07, checkW08];

export function runAllWarningChecks(ctx: WarningContext): Warning[] {
  return CHECKS.map((check) => check(ctx)).filter((w): w is Warning => w !== null);
}
