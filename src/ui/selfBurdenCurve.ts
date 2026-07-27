import { selfBurden } from '../domain/furusato';
import type { TaxParams } from '../taxParams/schema';
import type { YearProfile, Yen } from '../domain/types';

export const CURVE_STEP_MIN = 1000;
/** サンプリングの目安点数。上限額が小さい場合でも折れ曲がり(傾きの変化点)が粗いグリッドに
 *  埋もれないよう、範囲(maxDonation)に応じてサンプリング間隔を可変にする(実装後レビュー対応)。 */
const CURVE_POINT_COUNT = 60;

export interface SelfBurdenCurvePoint {
  donation: number;
  selfBurden: number;
}

/**
 * S-06 自己負担曲線(Issue #11、FR-12)のデータ点を生成する。maxDonationに対して相対的な
 * 間隔でサンプリングしつつ、傾きの変化点(limitAmount)とmaxDonation自体を必ず含めることで、
 * 上限額の大小に関わらずエルボーの位置がぼやけないようにする。
 */
export function buildSelfBurdenCurve(
  profile: YearProfile,
  params: TaxParams,
  maxDonation: number,
  limitAmount: number
): SelfBurdenCurvePoint[] {
  const step = Math.max(CURVE_STEP_MIN, Math.round(maxDonation / CURVE_POINT_COUNT / CURVE_STEP_MIN) * CURVE_STEP_MIN);
  const donations = new Set<number>();
  for (let d = 0; d <= maxDonation; d += step) donations.add(d);
  donations.add(maxDonation);
  donations.add(limitAmount);
  return Array.from(donations)
    .sort((a, b) => a - b)
    .map((d) => ({ donation: d, selfBurden: selfBurden(profile, d as Yen, params, 'standard') }));
}
