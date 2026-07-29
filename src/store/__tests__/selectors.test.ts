import { describe, expect, it } from 'vitest';
import { emptyAppData, type AppData, type Person } from '../../persistence/types';
import { makeProfile, TAX_PARAMS_2026 } from '../../domain/__tests__/testHelpers';
import { selectActivePerson, selectActiveYearProfile, selectHouseholdSummary, selectSpouseTotalIncome } from '../selectors';
import { yokohamaMunicipality } from './testUtils';

function person(id: string, displayName: string, years: Person['years'] = {}): Person {
  return {
    id,
    displayName,
    color: '#336699',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    years,
    defaults: { municipality: yokohamaMunicipality(), safetyRatio: 0.9 },
  };
}

function appDataWith(...persons: Person[]): AppData {
  return { ...emptyAppData(), persons, activePersonId: persons[0]?.id ?? null };
}

describe('selectActivePerson / selectActiveYearProfile', () => {
  it('appDataがnullならnullを返す', () => {
    expect(selectActivePerson({ appData: null, activePersonId: 'p1' })).toBeNull();
    expect(selectActiveYearProfile({ appData: null, activePersonId: 'p1', activeYear: 2026 })).toBeNull();
  });

  it('activePersonIdに一致する人物を返す', () => {
    const p1 = person('p1', '本人');
    const appData = appDataWith(p1);
    expect(selectActivePerson({ appData, activePersonId: 'p1' })).toEqual(p1);
    expect(selectActivePerson({ appData, activePersonId: 'missing' })).toBeNull();
  });

  it('activeYearに一致するYearProfileを返す(無ければnull)', () => {
    const profile = makeProfile({ year: 2026 });
    const p1 = person('p1', '本人', { 2026: profile });
    const appData = appDataWith(p1);
    expect(selectActiveYearProfile({ appData, activePersonId: 'p1', activeYear: 2026 })).toEqual(profile);
    expect(selectActiveYearProfile({ appData, activePersonId: 'p1', activeYear: 2025 })).toBeNull();
  });
});

describe('selectHouseholdSummary', () => {
  it('appDataが無ければ空配列', () => {
    expect(selectHouseholdSummary({ appData: null, taxParams: {} }, 2026)).toEqual([]);
  });

  it('taxParams未キャッシュの人物はavailable:falseで返す(fetchはしない)', () => {
    const p1 = person('p1', '本人', { 2026: makeProfile({ year: 2026 }) });
    const appData = appDataWith(p1);
    const summary = selectHouseholdSummary({ appData, taxParams: {} }, 2026);
    expect(summary).toEqual([{ personId: 'p1', displayName: '本人', color: '#336699', available: false }]);
  });

  it('YearProfileが無い人物もavailable:falseで返す', () => {
    const p1 = person('p1', '本人');
    const appData = appDataWith(p1);
    const summary = selectHouseholdSummary({ appData, taxParams: { 2026: TAX_PARAMS_2026 } }, 2026);
    expect(summary[0]).toEqual({ personId: 'p1', displayName: '本人', color: '#336699', available: false });
  });

  it('taxParamsがキャッシュ済みなら各人物の上限額を計算して返す', () => {
    const p1 = person('p1', '本人', { 2026: makeProfile({ year: 2026, furusato: { method: 'oneStop', donatedAmount: 10_000, safetyRatio: 0.9, donations: [] } }) });
    const p2 = person('p2', '配偶者', { 2026: makeProfile({ year: 2026 }) });
    const appData = appDataWith(p1, p2);
    const summary = selectHouseholdSummary({ appData, taxParams: { 2026: TAX_PARAMS_2026 } }, 2026);
    expect(summary).toHaveLength(2);
    for (const entry of summary) {
      expect(entry.available).toBe(true);
      expect(typeof entry.limitAmount).toBe('number');
      expect(typeof entry.recommendedAmount).toBe('number');
      expect(typeof entry.warningCount).toBe('number');
    }
    expect(summary[0].donated).toBe(10_000);
    expect(summary[0].remaining).toBe(Math.max(0, (summary[0].limitAmount ?? 0) - 10_000));
  });

  it('preferredYearが無い人物はその人物の最新年度を使う', () => {
    const p1 = person('p1', '本人', { 2025: makeProfile({ year: 2025 }) });
    const appData = appDataWith(p1);
    const summary = selectHouseholdSummary({ appData, taxParams: { 2025: TAX_PARAMS_2026 } }, 2026);
    expect(summary[0].available).toBe(true);
  });
});

describe('selectSpouseTotalIncome', () => {
  it('配偶者・年度・taxParamsが揃っていれば合計所得金額を返す', () => {
    const spouseProfile = makeProfile({ year: 2026, income: { monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, status: 'actual', grossSalary: 200_000, socialInsurance: 30_000, isSocialInsuranceExempt: false })), bonuses: [], leavePeriods: [], otherSalaryIncome: 0 } });
    const spouse = person('sp1', '配偶者', { 2026: spouseProfile });
    const appData = appDataWith(spouse);
    const income = selectSpouseTotalIncome({ appData, taxParams: { 2026: TAX_PARAMS_2026 } }, 'sp1', 2026);
    expect(income).toBeGreaterThan(0);
  });

  it('配偶者が存在しない・年度データが無い・taxParams未キャッシュの場合はnull', () => {
    const appData = appDataWith(person('p1', '本人'));
    expect(selectSpouseTotalIncome({ appData, taxParams: { 2026: TAX_PARAMS_2026 } }, 'missing', 2026)).toBeNull();
    const spouse = person('sp1', '配偶者');
    expect(
      selectSpouseTotalIncome({ appData: appDataWith(spouse), taxParams: { 2026: TAX_PARAMS_2026 } }, 'sp1', 2026)
    ).toBeNull();
    const spouseWithYear = person('sp1', '配偶者', { 2026: makeProfile({ year: 2026 }) });
    expect(selectSpouseTotalIncome({ appData: appDataWith(spouseWithYear), taxParams: {} }, 'sp1', 2026)).toBeNull();
  });
});
