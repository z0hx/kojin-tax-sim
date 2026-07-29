import { describe, expect, it } from 'vitest';
import { evaluateOneStopEligibility, oneStopDeadline, ONE_STOP_MAX_MUNICIPALITIES, sumDonations } from '../donations';
import { makeProfile } from './testHelpers';
import type { DonationRecord } from '../types';

function record(municipalityName: string, amount: number, date = '2026-06-01'): DonationRecord {
  return { id: municipalityName, municipalityName, amount, date };
}

describe('sumDonations', () => {
  it('空配列は0', () => {
    expect(sumDonations([])).toBe(0);
  });

  it('各実績の金額を合計する', () => {
    expect(sumDonations([record('横浜市', 10_000), record('北海道○○町', 20_000)])).toBe(30_000);
  });
});

describe('oneStopDeadline', () => {
  it('寄附年の翌年1月10日を返す', () => {
    expect(oneStopDeadline(2026)).toBe('2027-01-10');
  });
});

describe('evaluateOneStopEligibility(Issue #17完了条件: 要否・締切がリスト表示される)', () => {
  it('医療費控除が無く5自治体以内なら利用可能', () => {
    const profile = makeProfile({
      furusato: { method: 'oneStop', donatedAmount: 30_000, safetyRatio: 0.9, donations: [record('横浜市', 10_000), record('川崎市', 20_000)] },
    });
    const result = evaluateOneStopEligibility(profile);
    expect(result.eligible).toBe(true);
    expect(result.deadline).toBe('2027-01-10');
    expect(result.reason).toBeUndefined();
  });

  it('医療費控除の入力がある場合は利用不可(FR-14と連動)', () => {
    const profile = makeProfile({
      furusato: { method: 'oneStop', donatedAmount: 10_000, safetyRatio: 0.9, donations: [record('横浜市', 10_000)] },
    });
    profile.deductions.medical = { paid: 150_000, reimbursed: 0, selfMedication: 0, mode: 'medical' };
    const result = evaluateOneStopEligibility(profile);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('確定申告');
  });

  it('寄附先が5自治体を超える場合は利用不可', () => {
    const donations = Array.from({ length: 6 }, (_, i) => record(`自治体${i}`, 5_000));
    const profile = makeProfile({
      furusato: { method: 'oneStop', donatedAmount: 30_000, safetyRatio: 0.9, donations },
    });
    const result = evaluateOneStopEligibility(profile);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('6自治体');
  });

  it('ちょうど5自治体(上限)なら利用可能', () => {
    const donations = Array.from({ length: ONE_STOP_MAX_MUNICIPALITIES }, (_, i) => record(`自治体${i}`, 5_000));
    const profile = makeProfile({
      furusato: { method: 'oneStop', donatedAmount: 25_000, safetyRatio: 0.9, donations },
    });
    expect(evaluateOneStopEligibility(profile).eligible).toBe(true);
  });

  it('同一自治体への複数回の寄附は1自治体として数える', () => {
    const donations = [record('横浜市', 10_000, '2026-04-01'), { ...record('横浜市', 5_000, '2026-09-01'), id: 'x' }];
    const profile = makeProfile({
      furusato: { method: 'oneStop', donatedAmount: 15_000, safetyRatio: 0.9, donations },
    });
    expect(evaluateOneStopEligibility(profile).eligible).toBe(true);
  });

  it('住宅ローン控除の初年度(入居年)は確定申告が必要なため利用不可', () => {
    const profile = makeProfile({
      furusato: { method: 'oneStop', donatedAmount: 10_000, safetyRatio: 0.9, donations: [record('横浜市', 10_000)] },
      housingLoan: {
        moveInYear: 2026,
        years: 13,
        rate: 0.007,
        yearEndBalance: 30_000_000,
        borrowingCap: 40_000_000,
        residentTaxCapRule: 'rule5pct97500',
      },
    });
    const result = evaluateOneStopEligibility(profile);
    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('住宅ローン控除の初年度');
  });

  it('住宅ローン控除の2年目以降は年末調整で完結するため利用可能', () => {
    const profile = makeProfile({
      furusato: { method: 'oneStop', donatedAmount: 10_000, safetyRatio: 0.9, donations: [record('横浜市', 10_000)] },
      housingLoan: {
        moveInYear: 2025,
        years: 13,
        rate: 0.007,
        yearEndBalance: 30_000_000,
        borrowingCap: 40_000_000,
        residentTaxCapRule: 'rule5pct97500',
      },
    });
    expect(evaluateOneStopEligibility(profile).eligible).toBe(true);
  });
});
