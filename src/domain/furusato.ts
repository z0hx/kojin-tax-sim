import type { TaxParams } from '../taxParams/schema';
import { calcSnapshot } from './engine';
import { floorTo, floorYen, type FurusatoCapMode, type TaxSnapshot, type YearProfile, type Yen } from './types';

const STEP = 1000;
// 45%税率帯(課税所得4,000万円超)の高所得ケースでも上限額が頭打ちにならないよう、
// 十分大きい初期上限を取る(二分探索のためlog2(20,000,000/1000)≈15回程度の増加で済む)。
const INITIAL_HI = 20_000_000;
const ALLOWED_SELF_BURDEN = 2000;
const LINEAR_GUARD_STEPS = 5;

/** 02仕様書§4.2: 「寄附なし」「寄附額D」の2ケースの税額差から自己負担額を求める */
export function selfBurden(profile: YearProfile, donation: Yen, params: TaxParams, mode: FurusatoCapMode): Yen {
  const base = calcSnapshot(profile, 0 as Yen, params, mode);
  const withDonation = calcSnapshot(profile, donation, params, mode);
  const incomeTaxReduction = base.incomeTax.total - withDonation.incomeTax.total;
  const residentReduction = base.residentTax.total - withDonation.residentTax.total;
  return (donation - (incomeTaxReduction + residentReduction)) as Yen;
}

export interface FurusatoLimitResult {
  limit: Yen;
  recommended: Yen;
  approxByFormula: Yen;
  snapshotAtZero: TaxSnapshot;
  snapshotAtLimit: TaxSnapshot;
}

/** 1,000円刻みの二分探索+単調性ガードで上限額を求める(02仕様書§4.1〜4.2) */
export function findFurusatoLimit(profile: YearProfile, params: TaxParams, mode: FurusatoCapMode): FurusatoLimitResult {
  const snapshotAtZero = calcSnapshot(profile, 0 as Yen, params, mode);
  // 簡易計算式の分子も20%枠と同じ基準(標準税率10%の所得割額)を使う。実効税率ベースの
  // 所得割額を使うと、超過課税のある自治体で簡易式だけが過大に出て差分方式の結果と食い違う。
  const approxByFormula = floorYen(
    (snapshotAtZero.residentTax.incomeLevyForFurusatoCap * params.residentTax.furusatoSpecialCapRatio) /
      (0.9 - snapshotAtZero.marginalRate * (1 + params.incomeTax.reconstructionSurtaxRate)) +
      2000
  );

  // 所得割額が0円(非課税)の場合、寄附金控除による便益は原理的に発生しない。
  // 差分方式の式だけを機械的に適用すると「2,000円以下の寄附は自己負担も2,000円以下」という
  // 自明な帰結から見かけ上limit=2,000円が出てしまうため、ここで明示的に0円に固定する(W-05と対応)。
  if (snapshotAtZero.residentTax.incomeLevy === 0) {
    return { limit: 0 as Yen, recommended: 0 as Yen, approxByFormula, snapshotAtZero, snapshotAtLimit: snapshotAtZero };
  }

  if (selfBurden(profile, STEP as Yen, params, mode) > ALLOWED_SELF_BURDEN) {
    return { limit: 0 as Yen, recommended: 0 as Yen, approxByFormula, snapshotAtZero, snapshotAtLimit: snapshotAtZero };
  }

  let lo = 0;
  let hi = INITIAL_HI;
  while (hi - lo > STEP) {
    const mid = floorTo((lo + hi) / 2, STEP);
    if (selfBurden(profile, mid as Yen, params, mode) <= ALLOWED_SELF_BURDEN) lo = mid;
    else hi = mid;
  }
  // 単調性ガード: 二分探索終了時点のloを基点に固定し、そこから最大5ステップだけ線形に前進検証する。
  // (loをそのままループ条件に使うと、探索中にloが動くたびに終了条件も一緒に前進してしまい、
  //  実質無制限の線形探索になってしまうバグがあったため、基点をguardStartとして固定する)
  const guardStart = lo;
  for (let d = guardStart + STEP; d <= guardStart + STEP * LINEAR_GUARD_STEPS; d += STEP) {
    if (selfBurden(profile, d as Yen, params, mode) <= ALLOWED_SELF_BURDEN) lo = d;
  }

  const limit = lo as Yen;
  const recommended = floorTo(limit * profile.furusato.safetyRatio, STEP) as Yen;
  const snapshotAtLimit = calcSnapshot(profile, limit, params, mode);

  return { limit, recommended, approxByFormula, snapshotAtZero, snapshotAtLimit };
}
