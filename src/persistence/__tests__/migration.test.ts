import { describe, expect, it } from 'vitest';
import { ImportError } from '../errors';
import { CURRENT_SCHEMA_VERSION, migrate } from '../migration';
import { emptyAppData } from '../types';

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
    const data = emptyAppData();
    expect(migrate(data)).toEqual(data);
  });
});

describe('migrate (T-28 移行フィクスチャ)', () => {
  it('現行バージョンと同じデータは変更されずに返る', () => {
    const fixture = { schemaVersion: 1, persons: [], activePersonId: null, appSettings: { theme: 'system', furusatoCapMode: 'standard', lastExportedAt: null, onboardingCompleted: false, taxParamsVerifiedAt: {} } };
    expect(migrate(fixture)).toEqual(fixture);
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
    furusato: { method: 'oneStop', donatedAmount: 0, safetyRatio: 0.9 },
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

  it('yearsのキーが数値変換できない場合は例外を投げる', () => {
    const person = { ...personWithYear(validYearProfile()), years: { notANumber: validYearProfile() } };
    const data = { schemaVersion: 1, persons: [person], activePersonId: 'p1', appSettings: {} };
    expect(() => migrate(data)).toThrow(ImportError);
  });
});
