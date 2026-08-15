import type { TaxParams } from '../taxParams/schema';
import { calcSnapshot } from './engine';
import { floorTo, floorYen, type FurusatoCapMode, type TaxSnapshot, type YearProfile, type Yen } from './types';

const STEP = 1000;
// 45%税率帯(課税所得4,000万円超)の高所得ケースでも上限額が頭打ちにならないよう、
// 十分大きい初期上限を取る(二分探索のためlog2(20,000,000/1000)≈15回程度の増加で済む)。
const INITIAL_HI = 20_000_000;
const ALLOWED_SELF_BURDEN = 2000;
/**
 * 端数処理の許容幅。02仕様書§4.1の判定式は「自己負担(D) ≦ 2,000円」だが、差分方式の自己負担額には
 * 税額計算の100円未満切り捨てに由来する端数が乗るため、2,000円ちょうどで切ると上限額が大きく縮む。
 *
 * 差分に効きうる切り捨ては次の3段で、それぞれ最大99円ずれる(合計297円 < 300円)。
 *   1. 差引所得税額の100円未満切り捨て
 *   2. 復興特別所得税の100円未満切り捨て
 *   3. 住民税所得割(確定)の100円未満切り捨て
 * 課税総所得金額の1,000円未満切り捨ては、探索が1,000円刻みで寄附金控除額の差も1,000円の倍数に
 * なるため、2ケースの差分では相殺されて効かない(総所得金額×40%の上限が効く寄附額まで行くと
 * 相殺されないが、そこは上限額よりはるかに先で自己負担も桁違いに大きく、判定に影響しない)。
 *
 * 上限額を超えた先では自己負担が1,000円あたり(90% − 所得税率×1.021)×1,000円 ≧ 440円(45%税率帯)
 * 増えるため、300円の許容で上限を超えた寄附額を取り込むことはあっても1ステップ(1,000円)に
 * とどまる。上限を数万円単位で取りこぼす従来の挙動より実態に近い。
 *
 * なお、所得税額が住宅ローン控除で0円かつ住民税側の控除枠も埋まっている年分では、自己負担は
 * 端数ではなく寄附額に比例して増える。この帯では300円の許容がそのまま「自己負担2,300円までは
 * 上限とみなす」意味を持つが、内訳表示は実額の自己負担を返すため過小表示にはならない。
 */
const SELF_BURDEN_ROUNDING_SLACK = 300;
export const SELF_BURDEN_BUDGET = ALLOWED_SELF_BURDEN + SELF_BURDEN_ROUNDING_SLACK;
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

/**
 * 1,000円刻みの二分探索+単調性ガードで上限額を求める(02仕様書§4.1〜4.2)。
 * `budget`は「許容する自己負担額」。既定はSELF_BURDEN_BUDGET(2,000円+端数許容)で、
 * FR-32の自己負担段階表(buildSelfBurdenLadder)だけがこれより大きい値を渡す。
 */
export function findFurusatoLimit(
  profile: YearProfile,
  params: TaxParams,
  mode: FurusatoCapMode,
  budget: number = SELF_BURDEN_BUDGET
): FurusatoLimitResult {
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

  if (selfBurden(profile, STEP as Yen, params, mode) > budget) {
    return { limit: 0 as Yen, recommended: 0 as Yen, approxByFormula, snapshotAtZero, snapshotAtLimit: snapshotAtZero };
  }

  let lo = 0;
  let hi = INITIAL_HI;
  while (hi - lo > STEP) {
    const mid = floorTo((lo + hi) / 2, STEP);
    if (selfBurden(profile, mid as Yen, params, mode) <= budget) lo = mid;
    else hi = mid;
  }
  // 単調性ガード: 二分探索終了時点のloを基点に固定し、そこから最大5ステップだけ線形に前進検証する。
  // (loをそのままループ条件に使うと、探索中にloが動くたびに終了条件も一緒に前進してしまい、
  //  実質無制限の線形探索になってしまうバグがあったため、基点をguardStartとして固定する)
  const guardStart = lo;
  for (let d = guardStart + STEP; d <= guardStart + STEP * LINEAR_GUARD_STEPS; d += STEP) {
    if (selfBurden(profile, d as Yen, params, mode) <= budget) lo = d;
  }

  const limit = lo as Yen;
  const recommended = floorTo(limit * profile.furusato.safetyRatio, STEP) as Yen;
  const snapshotAtLimit = calcSnapshot(profile, limit, params, mode);

  return { limit, recommended, approxByFormula, snapshotAtZero, snapshotAtLimit };
}

/**
 * FR-32 自己負担段階表の既定の段。1段目は通常の上限額(SELF_BURDEN_BUDGET)と一致させる。
 * 「自己負担2,000円」を諦めたときにどこまで寄附できるかを見るための表なので、
 * 段は自己負担額そのもので刻む(寄附額側で刻むと年分ごとに意味が変わってしまう)。
 */
export const DEFAULT_SELF_BURDEN_BUDGETS: readonly number[] = [SELF_BURDEN_BUDGET, 3000, 5000, 10_000, 20_000];

export interface SelfBurdenLadderRow {
  /** 探索に使った許容自己負担額 */
  budget: number;
  limit: Yen;
  /** その寄附額での実際の自己負担額。表示はこちらを使う(端数許容の存在を利用者に説明せずに済む) */
  selfBurden: Yen;
  /** 1段前からの増分。1段目は0 */
  deltaDonation: Yen;
  deltaSelfBurden: Yen;
  /** 追加自己負担1円あたりの追加寄附額。1段目と、追加自己負担が0円の段はnull */
  donationPerYen: number | null;
}

/**
 * FR-32: 許容する自己負担額ごとの上限額を並べた表を作る。
 * 上限額を超えた先の増え方は年分によって大きく違い(20%枠に達しての崖か、所得税側で
 * 控除しきれないことによるなだらかな増加か)、単一の上限額だけでは判断できないため、
 * 「自己負担をいくらまで許せば寄附額をいくらまで伸ばせるか」を数字で示す。
 *
 * 同じ上限額になる段は畳む(崖の年では3,000円と5,000円が同じ額になることがある)。
 * 上限額が0円(非課税など)の年分は空配列を返す。
 */
export function buildSelfBurdenLadder(
  profile: YearProfile,
  params: TaxParams,
  mode: FurusatoCapMode,
  budgets: readonly number[] = DEFAULT_SELF_BURDEN_BUDGETS
): SelfBurdenLadderRow[] {
  const rows: SelfBurdenLadderRow[] = [];
  for (const budget of [...budgets].sort((a, b) => a - b)) {
    const { limit } = findFurusatoLimit(profile, params, mode, budget);
    if (limit <= 0) continue;
    const prev = rows[rows.length - 1];
    if (prev && prev.limit === limit) continue;
    const burden = selfBurden(profile, limit, params, mode);
    const deltaDonation = (prev ? limit - prev.limit : 0) as Yen;
    const deltaSelfBurden = (prev ? burden - prev.selfBurden : 0) as Yen;
    rows.push({
      budget,
      limit,
      selfBurden: burden,
      deltaDonation,
      deltaSelfBurden,
      donationPerYen: prev && deltaSelfBurden > 0 ? deltaDonation / deltaSelfBurden : null,
    });
  }
  return rows;
}

/**
 * FR-32: 「自己負担を少し許すだけで寄附額を大きく伸ばせる年分」と案内する閾値。
 * 追加自己負担1円あたりこの額以上の寄附を伸ばせる段があれば案内する。返礼品の還元率を3割とすると、
 * 追加負担1円あたり3円以上の寄附で返礼品の価値が追加負担に見合う計算になるため、3円を採る。
 */
export const LADDER_HINT_DONATION_PER_YEN = 3;

export interface LadderHint {
  row: SelfBurdenLadderRow;
  /** 通常の上限額(1段目)からの累計で見た、追加自己負担1円あたりの追加寄附額 */
  donationPerYen: number;
}

/**
 * 段階表のうち、ダッシュボードで案内するに値する最初の段を返す(該当が無ければnull)。
 *
 * 判定は1段目(通常の上限額)からの累計で行う。隣り合う段どうしの比で判定すると、
 * 自己負担の差が端数(最大SELF_BURDEN_ROUNDING_SLACK)しか無い段で比が大きく出てしまい、
 * 実際には崖の年分にも案内が出てしまうため。同じ理由で、端数と区別できない差
 * (端数許容の2倍未満)しか無い段は判定の対象にしない。
 */
export function findLadderHintRow(rows: SelfBurdenLadderRow[]): LadderHint | null {
  const base = rows[0];
  if (!base) return null;
  for (const row of rows.slice(1)) {
    const deltaSelfBurden = row.selfBurden - base.selfBurden;
    if (deltaSelfBurden < SELF_BURDEN_ROUNDING_SLACK * 2) continue;
    const donationPerYen = (row.limit - base.limit) / deltaSelfBurden;
    if (donationPerYen >= LADDER_HINT_DONATION_PER_YEN) return { row, donationPerYen };
  }
  return null;
}
