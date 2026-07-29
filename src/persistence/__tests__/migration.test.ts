import { describe, expect, it } from 'vitest';
import { ImportError } from '../errors';
import { migrate } from '../migration';
import { CURRENT_SCHEMA_VERSION, emptyAppData } from '../types';

describe('migrate (T-27 不正なJSON)', () => {
  it('schemaVersionが欠落している場合は例外を投げる', () => {
    expect(() => migrate({ persons: [] })).toThrow(ImportError);
  });

  it('schemaVersionの型が不正な場合は例外を投げる', () => {
    expect(() => migrate({ schemaVersion: '1', persons: [] })).toThrow(ImportError);
  });

  it('現行バージョンより新しい場合は例外を投げる', () => {
    expect(() => migrate({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, persons: [], activePersonId: null, appSettings: {} })).toThrow(
      ImportError
    );
  });

  it('personsが配列でない場合は例外を投げる', () => {
    expect(() => migrate({ schemaVersion: 1, persons: 'not-an-array', activePersonId: null, appSettings: {} })).toThrow(ImportError);
  });

  it('正常なAppDataはそのまま返る(移行不要)', () => {
    const data = { ...emptyAppData(), schemaVersion: CURRENT_SCHEMA_VERSION };
    expect(migrate(data)).toEqual(data);
  });
});

describe('migrate (T-28 移行フィクスチャ)', () => {
  it('現行バージョンと同じデータは変更されずに返る', () => {
    const fixture = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      persons: [],
      activePersonId: null,
      appSettings: { lastExportedAt: null },
    };
    expect(migrate(fixture)).toEqual(fixture);
  });

  it('furusato.donationsを持たない旧形式データは移行されず例外になる(#36: v1で確定したためv1→v2の移行は無い)', () => {
    const legacyProfile: Record<string, unknown> = validYearProfile();
    legacyProfile.furusato = { method: 'oneStop', donatedAmount: 0, safetyRatio: 0.9 };
    const data = { schemaVersion: 1, persons: [personWithYear(legacyProfile)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });

  it('現行スキーマは2(emptyAppDataが書き込む値と一致する)', () => {
    expect(CURRENT_SCHEMA_VERSION).toBe(2);
    expect(emptyAppData().schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('v1データはv2へ移行され、内容は書き換えられない(Issue #48: 内訳フィールドは省略可のため値の変換は不要)', () => {
    const v1 = { schemaVersion: 1, persons: [personWithYear(validYearProfile())], activePersonId: 'p1', appSettings: { lastExportedAt: null } };

    const migrated = migrate(v1);

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.persons).toEqual(v1.persons);
  });

  it('schemaVersionが0など移行手順の無い過去バージョンは例外になる', () => {
    const data = { schemaVersion: 0, persons: [], activePersonId: null, appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });
});

function validYearProfile() {
  return {
    year: 2026,
    municipality: { name: '横浜市' },
    income: {
      monthly: Array.from({ length: 12 }, (_, i) => ({ month: i + 1, status: 'actual', grossSalary: 400_000, socialInsurance: 60_000, isSocialInsuranceExempt: false })),
      bonuses: [],
      leavePeriods: [],
      otherSalaryIncome: 0,
    },
    deductions: { lifeInsurance: {}, earthquakeInsurance: { long: 0, short: 0 }, medical: { paid: 0, reimbursed: 0, selfMedication: 0, mode: 'auto' }, ideco: 0, dependents: [], isSingleParent: false, disabilityDeductions: [] },
    furusato: { method: 'oneStop', donatedAmount: 0, safetyRatio: 0.9, donations: [] },
  };
}

function personWithYear(yearProfile: unknown) {
  return {
    id: 'p1',
    displayName: '本人',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    years: { 2026: yearProfile },
    defaults: {},
  };
}

describe('migrate (Medium#7是正: YearProfileの数値検証)', () => {
  it('正常なYearProfileを含むデータは通過する', () => {
    const data = { schemaVersion: 1, persons: [personWithYear(validYearProfile())], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).not.toThrow();
  });

  it('月次給与が負の値の場合は例外を投げる(データ破損・改ざんの検知)', () => {
    const corrupted = validYearProfile();
    corrupted.income.monthly[0].grossSalary = -500_000;
    const data = { schemaVersion: 1, persons: [personWithYear(corrupted)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });

  it('賞与のgrossが負の値の場合も例外を投げる(レビュー3巡目Low是正)', () => {
    const base = validYearProfile();
    const corrupted = {
      ...base,
      income: {
        ...base.income,
        bonuses: [{ label: '夏季賞与', month: 6, status: 'actual', gross: -100_000, socialInsurance: 0, isExempt: false }],
      },
    };
    const data = { schemaVersion: 1, persons: [personWithYear(corrupted)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });

  it('income.monthlyが12ヶ月分でない場合は例外を投げる', () => {
    const corrupted = validYearProfile();
    corrupted.income.monthly = corrupted.income.monthly.slice(0, 3);
    const data = { schemaVersion: 1, persons: [personWithYear(corrupted)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });

  it('furusato.donatedAmountが負の値の場合は例外を投げる', () => {
    const corrupted = validYearProfile();
    corrupted.furusato.donatedAmount = -1000;
    const data = { schemaVersion: 1, persons: [personWithYear(corrupted)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });

  it('社会保険料の内訳(Issue #48)が正常なデータは通過する', () => {
    const profile = validYearProfile() as unknown as { income: { monthly: Record<string, unknown>[] } };
    profile.income.monthly[0] = {
      ...profile.income.monthly[0],
      socialInsuranceInputMode: 'breakdown',
      socialInsuranceBreakdown: { healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 },
    };
    const data = { schemaVersion: 2, persons: [personWithYear(profile)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).not.toThrow();
  });

  it('社会保険料の内訳に負の値が含まれる場合は例外を投げる', () => {
    const profile = validYearProfile() as unknown as { income: { monthly: Record<string, unknown>[] } };
    profile.income.monthly[0] = {
      ...profile.income.monthly[0],
      socialInsuranceInputMode: 'breakdown',
      socialInsuranceBreakdown: { healthInsurance: -1, nursingCare: 0, pension: 0, employmentInsurance: 0, other: 0 },
    };
    const data = { schemaVersion: 2, persons: [personWithYear(profile)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });

  it('社会保険料の内訳の項目が欠落している場合は例外を投げる', () => {
    const profile = validYearProfile() as unknown as { income: { monthly: Record<string, unknown>[] } };
    profile.income.monthly[0] = {
      ...profile.income.monthly[0],
      socialInsuranceBreakdown: { healthInsurance: 20_000, pension: 36_000 },
    };
    const data = { schemaVersion: 2, persons: [personWithYear(profile)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });

  it('socialInsuranceInputModeが未知の値の場合は例外を投げる', () => {
    const profile = validYearProfile() as unknown as { income: { monthly: Record<string, unknown>[] } };
    profile.income.monthly[0] = { ...profile.income.monthly[0], socialInsuranceInputMode: 'itemized' };
    const data = { schemaVersion: 2, persons: [personWithYear(profile)], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });

  it('yearsのキーが数値変換できない場合は例外を投げる', () => {
    const person = { ...personWithYear(validYearProfile()), years: { notANumber: validYearProfile() } };
    const data = { schemaVersion: 1, persons: [person], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });
});
