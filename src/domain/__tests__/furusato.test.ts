import { describe, expect, it } from 'vitest';
import { calcSnapshot } from '../engine';
import { buildSelfBurdenLadder, findFurusatoLimit, findLadderHintRow, selfBurden, SELF_BURDEN_BUDGET, type SelfBurdenLadderRow } from '../furusato';
import type { YearProfile, Yen } from '../types';
import { TAX_PARAMS_2026, makeM1Profile, makeProfile, monthlyAllYear } from './testHelpers';

function standardEarnerProfile(): ReturnType<typeof makeProfile> {
  return makeProfile({
    income: {
      monthly: monthlyAllYear(500_000, 75_000),
      bonuses: [],
      leavePeriods: [],
      otherSalaryIncome: 0,
    },
  });
}

describe('findFurusatoLimit (T-01 標準ケース)', () => {
  it('年収600万円程度の独身者で上限額が算出される(正の値)', () => {
    const result = findFurusatoLimit(standardEarnerProfile(), TAX_PARAMS_2026, 'standard');
    expect(result.limit).toBeGreaterThan(0);
    expect(result.limit % 1000).toBe(0);
  });

  it('上限額ちょうどの寄附で自己負担が2,000円以下になる', () => {
    const profile = standardEarnerProfile();
    const result = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    const burden = selfBurden(profile, result.limit, TAX_PARAMS_2026, 'standard');
    expect(burden).toBeLessThanOrEqual(2000);
  });

  it('上限額+1,000円の寄附では自己負担が2,000円を超える', () => {
    const profile = standardEarnerProfile();
    const result = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    const burden = selfBurden(profile, (result.limit + 1000) as Yen, TAX_PARAMS_2026, 'standard');
    expect(burden).toBeGreaterThan(2000);
  });
});

describe('findFurusatoLimit: 端数許容 (自己負担2,000円判定の丸め)', () => {
  // 確定申告ルートで、住宅ローン控除により所得税が0円になり、かつ住民税側の控除枠(97,500円)に
  // 余裕がある年分。寄附で所得税額が下がるとその分だけ住宅ローン控除が住民税へ回るため控除の
  // 取りこぼしは発生せず、自己負担は復興特別所得税ぶん(寄附額の0.21%)を除いて2,000円のまま
  // 推移する。にもかかわらず100円未満切り捨ての端数で自己負担が2,100円と出るため、
  // 2,000円ちょうどで判定すると上限額が数分の一に縮んでいた。
  // 所得税と特例分の税率帯を一致させるため(ずれると自己負担が税率差ぶん増える)、
  // 課税総所得金額が所得税・住民税ともに10%帯に入る収入で組む。
  const profile = (): YearProfile =>
    makeProfile({
      furusato: { method: 'taxReturn', donatedAmount: 0, safetyRatio: 0.9, donations: [] },
      income: { monthly: monthlyAllYear(0, 0), bonuses: [], leavePeriods: [], otherSalaryIncome: 6_400_000 },
      deductions: {
        socialInsuranceOverride: 1_000_000,
        lifeInsurance: { new: { general: 80_000, nursing: 0, pension: 0 }, old: { general: 0, pension: 0 }, hasChildUnder23: false },
        earthquakeInsurance: { long: 0, short: 0 },
        medical: { paid: 0, reimbursed: 0, selfMedication: 0, mode: 'auto' },
        ideco: 0,
        dependents: [],
        isSingleParent: false,
        disabilityDeductions: [],
      },
      housingLoan: { moveInYear: 2023, years: 13, rate: 0.007, yearEndBalance: 28_571_428, borrowingCap: 40_000_000, residentTaxCapRule: 'rule5pct97500' },
    });

  it('端数で上限額が縮まず、簡易計算式と同じ水準の上限額になる', () => {
    const result = findFurusatoLimit(profile(), TAX_PARAMS_2026, 'standard');
    expect(result.limit).toBeGreaterThanOrEqual(result.approxByFormula - 1000);
    expect(result.limit).toBeLessThanOrEqual(result.approxByFormula + 1000);
  });

  it('上限額の手前では住宅ローン控除の切り捨て損失が増えない(端数以外の自己負担が無い)', () => {
    const p = profile();
    const result = findFurusatoLimit(p, TAX_PARAMS_2026, 'standard');
    const atZero = calcSnapshot(p, 0 as Yen, TAX_PARAMS_2026, 'standard');
    const atLimit = calcSnapshot(p, result.limit, TAX_PARAMS_2026, 'standard');
    expect(atZero.housingLoan.wasted).toBe(0);
    expect(atLimit.housingLoan.wasted).toBe(0);
  });

  it('上限額を超えると自己負担が端数の範囲を明確に超える', () => {
    const p = profile();
    const result = findFurusatoLimit(p, TAX_PARAMS_2026, 'standard');
    expect(selfBurden(p, result.limit, TAX_PARAMS_2026, 'standard')).toBeLessThanOrEqual(SELF_BURDEN_BUDGET);
    expect(selfBurden(p, (result.limit + 1000) as Yen, TAX_PARAMS_2026, 'standard')).toBeGreaterThan(SELF_BURDEN_BUDGET);
  });
});

describe('findFurusatoLimit: 単調性 (T-15)', () => {
  it('上限付近±5,000円の範囲で自己負担が非減少である', () => {
    const profile = standardEarnerProfile();
    const result = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    const points: Yen[] = [];
    for (let d = Math.max(0, result.limit - 5000); d <= result.limit + 5000; d += 1000) points.push(d as Yen);

    const burdens = points.map((d) => selfBurden(profile, d, TAX_PARAMS_2026, 'standard'));
    for (let i = 1; i < burdens.length; i++) {
      expect(burdens[i]).toBeGreaterThanOrEqual(burdens[i - 1]);
    }
  });
});

describe('findFurusatoLimit: 推奨額(安全率)', () => {
  it('推奨額は上限額×安全率を1,000円単位で切り捨てた額になる', () => {
    const profile = standardEarnerProfile();
    profile.furusato.safetyRatio = 0.9;
    const result = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    expect(result.recommended).toBe(Math.floor((result.limit * 0.9) / 1000) * 1000);
  });
});

describe('findFurusatoLimit: 所得割非課税ケース (T-12)', () => {
  it('所得がない場合は上限0円になる', () => {
    const result = findFurusatoLimit(makeProfile(), TAX_PARAMS_2026, 'standard');
    expect(result.limit).toBe(0);
    expect(result.recommended).toBe(0);
  });
});

describe('findFurusatoLimit: 高所得ケース (レビュー指摘High#3是正)', () => {
  it('旧初期上限(2,000,000円)を超える上限額でも頭打ちにならない', () => {
    // 月給800万円(年収9,600万円)相当。45%税率帯に入る高所得ケース
    const profile = makeProfile({
      income: { monthly: monthlyAllYear(8_000_000, 0), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 },
    });
    const result = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    expect(result.limit).toBeGreaterThan(2_000_000);
    const burden = selfBurden(profile, result.limit, TAX_PARAMS_2026, 'standard');
    expect(burden).toBeLessThanOrEqual(SELF_BURDEN_BUDGET);
    const burdenOverLimit = selfBurden(profile, (result.limit + 1000) as Yen, TAX_PARAMS_2026, 'standard');
    expect(burdenOverLimit).toBeGreaterThan(SELF_BURDEN_BUDGET);
  });

  it('線形ガードの基点が固定されていること(上限より先はどの点でも予算内に戻らない)', () => {
    // 高所得帯では floor100 等の端数処理により自己負担額が1,000円刻みでわずかに
    // 上下する(例: 1900円→2000円→1900円のこぎり波)ため、判定はSELF_BURDEN_BUDGET
    // (2,000円+端数許容)で行う。ここでは「線形ガードの基点(guardStart)がloの変化に追従して
    // 無制限に伸びるバグ」が再発していないことを、上限より先の広い範囲で予算内に戻る点が
    // 無いことによって確認する。
    const profile = makeProfile({
      income: { monthly: monthlyAllYear(8_000_000, 0), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 },
    });
    const result = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    for (let d = result.limit + 1000; d <= result.limit + 50_000; d += 1000) {
      expect(selfBurden(profile, d as Yen, TAX_PARAMS_2026, 'standard')).toBeGreaterThan(SELF_BURDEN_BUDGET);
    }
  });
});

describe('buildSelfBurdenLadder (FR-32 自己負担段階表)', () => {
  /** 20%枠に達して崖になる年分(住宅ローン控除なし) */
  function cliffProfile(): YearProfile {
    return makeProfile({ income: { monthly: monthlyAllYear(500_000, 75_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 } });
  }

  /** 所得税側で控除しきれず、上限を超えても自己負担がなだらかに増える年分(確定申告ルート) */
  function slopeProfile(): YearProfile {
    const base = makeM1Profile(32_000_000);
    return { ...base, furusato: { ...base.furusato, method: 'taxReturn' as const } };
  }

  it('1段目は通常の上限額と一致し、段が進むほど上限額が増える', () => {
    const profile = cliffProfile();
    const rows = buildSelfBurdenLadder(profile, TAX_PARAMS_2026, 'standard');
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].limit).toBe(findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard').limit);
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i].limit).toBeGreaterThan(rows[i - 1].limit);
      expect(rows[i].selfBurden).toBeGreaterThan(rows[i - 1].selfBurden);
    }
  });

  it('各段の自己負担額は許容額以内に収まる', () => {
    const profile = cliffProfile();
    for (const row of buildSelfBurdenLadder(profile, TAX_PARAMS_2026, 'standard')) {
      expect(selfBurden(profile, row.limit, TAX_PARAMS_2026, 'standard')).toBeLessThanOrEqual(row.budget);
      expect(row.selfBurden).toBeLessThanOrEqual(row.budget);
    }
  });

  it('20%枠に達した先では追加自己負担1円あたりの追加寄附額が小さい(崖)', () => {
    const rows = buildSelfBurdenLadder(cliffProfile(), TAX_PARAMS_2026, 'standard');
    for (const row of rows.slice(1)) {
      expect(row.donationPerYen).not.toBeNull();
      expect(row.donationPerYen!).toBeLessThan(2);
    }
  });

  it('所得税側で控除しきれない年分では追加自己負担1円で何円も寄附を伸ばせる(なだらか)', () => {
    const rows = buildSelfBurdenLadder(slopeProfile(), TAX_PARAMS_2026, 'standard');
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[1].donationPerYen!).toBeGreaterThan(3);
  });

  it('上限額が同じになる段は畳む', () => {
    const rows = buildSelfBurdenLadder(cliffProfile(), TAX_PARAMS_2026, 'standard', [2300, 2300, 3000]);
    expect(rows.map((r) => r.limit)).toEqual(Array.from(new Set(rows.map((r) => r.limit))));
  });

  it('所得割が非課税の年分は空になる', () => {
    expect(buildSelfBurdenLadder(makeProfile(), TAX_PARAMS_2026, 'standard')).toEqual([]);
  });
});

describe('findLadderHintRow (FR-32 ダッシュボードの案内)', () => {
  function row(limit: number, selfBurden: number, budget: number): SelfBurdenLadderRow {
    return {
      budget,
      limit: limit as Yen,
      selfBurden: selfBurden as Yen,
      deltaDonation: 0 as Yen,
      deltaSelfBurden: 0 as Yen,
      donationPerYen: null,
    };
  }

  it('自己負担の増分が端数の範囲でしかない段は、比が大きく出ても案内しない', () => {
    // 1段目との差が300円(端数許容と同じ)しか無い。比は3.3だが端数と区別できない
    const rows = [row(77_000, 2200, 2300), row(78_000, 2500, 3000), row(81_000, 4900, 5000)];
    expect(findLadderHintRow(rows)).toBeNull();
  });

  it('端数と区別できる差があり、追加自己負担1円あたり3円以上寄附を伸ばせる段を案内する', () => {
    const rows = [row(5_000, 2300, 2300), row(12_000, 3000, 3000), row(32_000, 5000, 5000)];
    const hint = findLadderHintRow(rows);
    expect(hint?.row.limit).toBe(12_000);
    expect(hint?.donationPerYen).toBeCloseTo(10, 5);
  });

  it('段が1つしか無い場合はnullを返す', () => {
    expect(findLadderHintRow([row(77_000, 2200, 2300)])).toBeNull();
    expect(findLadderHintRow([])).toBeNull();
  });
});
