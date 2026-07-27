import { describe, expect, it } from 'vitest';
import { buildSelfBurdenCurve } from '../selfBurdenCurve';
import { TAX_PARAMS_2026, makeProfile, monthlyAllYear } from '../../domain/__tests__/testHelpers';
import { findFurusatoLimit } from '../../domain/furusato';

describe('buildSelfBurdenCurve(Issue #11レビュー対応: 上限額が小さいケースでも折れ曲がりがぼやけない)', () => {
  it('上限額(limitAmount)が必ずサンプル点に含まれる(エルボーの位置を正確に描くため)', () => {
    // 低収入プロファイル(上限額が小さいケース)
    const profile = makeProfile({ income: { monthly: monthlyAllYear(200_000, 20_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 } });
    const { limit } = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    const maxDonation = Math.max(limit * 1.5, limit + 20_000, 50_000);

    const curve = buildSelfBurdenCurve(profile, TAX_PARAMS_2026, maxDonation, limit);
    expect(curve.some((p) => p.donation === limit)).toBe(true);
  });

  it('maxDonation自体もサンプル点に含まれる', () => {
    const profile = makeProfile({ income: { monthly: monthlyAllYear(500_000, 70_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 } });
    const { limit } = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    const maxDonation = Math.max(limit * 1.5, limit + 20_000, 50_000);

    const curve = buildSelfBurdenCurve(profile, TAX_PARAMS_2026, maxDonation, limit);
    expect(curve.some((p) => p.donation === maxDonation)).toBe(true);
  });

  it('サンプリング間隔はmaxDonationに応じて可変になる(小さい上限額でも粗すぎない)', () => {
    const smallProfile = makeProfile({ income: { monthly: monthlyAllYear(200_000, 20_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 } });
    const { limit: smallLimit } = findFurusatoLimit(smallProfile, TAX_PARAMS_2026, 'standard');
    const smallMax = Math.max(smallLimit * 1.5, smallLimit + 20_000, 50_000);
    const smallCurve = buildSelfBurdenCurve(smallProfile, TAX_PARAMS_2026, smallMax, smallLimit);

    const largeProfile = makeProfile({ income: { monthly: monthlyAllYear(2_000_000, 250_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 } });
    const { limit: largeLimit } = findFurusatoLimit(largeProfile, TAX_PARAMS_2026, 'standard');
    const largeMax = Math.max(largeLimit * 1.5, largeLimit + 20_000, 50_000);
    const largeCurve = buildSelfBurdenCurve(largeProfile, TAX_PARAMS_2026, largeMax, largeLimit);

    // 上限額が小さいケースのサンプリング間隔は、上限額が大きいケースの間隔以下になる
    const smallStep = smallCurve[1].donation - smallCurve[0].donation;
    const largeStep = largeCurve[1].donation - largeCurve[0].donation;
    expect(smallStep).toBeLessThan(largeStep);
  });

  it('曲線は寄附額0から昇順に並んでいる', () => {
    const profile = makeProfile({ income: { monthly: monthlyAllYear(500_000, 70_000), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 } });
    const { limit } = findFurusatoLimit(profile, TAX_PARAMS_2026, 'standard');
    const maxDonation = Math.max(limit * 1.5, limit + 20_000, 50_000);

    const curve = buildSelfBurdenCurve(profile, TAX_PARAMS_2026, maxDonation, limit);
    expect(curve[0].donation).toBe(0);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].donation).toBeGreaterThan(curve[i - 1].donation);
    }
  });
});
