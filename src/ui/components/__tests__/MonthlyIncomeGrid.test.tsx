// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MonthlyIncomeGrid } from '../MonthlyIncomeGrid';
import type { LeavePeriod, MonthlyRecord } from '../../../domain/types';

afterEach(cleanup);

function makeMonthly(): MonthlyRecord[] {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    status: 'actual' as const,
    grossSalary: 400_000,
    socialInsurance: 60_000,
    isSocialInsuranceExempt: false,
  }));
}

describe('MonthlyIncomeGrid', () => {
  it('月の給与を編集するとその月だけ更新した配列でonChangeを呼ぶ', () => {
    const monthly = makeMonthly();
    const onChange = vi.fn();
    render(<MonthlyIncomeGrid monthly={monthly} leavePeriods={[]} year={2026} onChange={onChange} />);

    const input = screen.getByLabelText('3月の給与');
    fireEvent.change(input, { target: { value: '500000' } });

    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MonthlyRecord[];
    expect(lastCall.find((m) => m.month === 3)?.grossSalary).toBe(500000);
    // 他の月は変更されない
    expect(lastCall.find((m) => m.month === 1)?.grossSalary).toBe(400_000);
  });

  it('育休期間中の月はleavePeriodsから導出してdisabled・0円表示になる(生データのisSocialInsuranceExemptは見ない)', () => {
    const monthly = makeMonthly(); // isSocialInsuranceExemptは全てfalse
    const leavePeriods: LeavePeriod[] = [{ type: 'childcare', startYm: '2026-01', endYm: '2026-02', benefitAmount: 100_000 }];
    render(<MonthlyIncomeGrid monthly={monthly} leavePeriods={leavePeriods} year={2026} onChange={vi.fn()} />);

    const janInput = screen.getByLabelText('1月の給与') as HTMLInputElement;
    expect(janInput).toBeDisabled();
    expect(janInput.value).toBe('0');

    const marInput = screen.getByLabelText('3月の給与') as HTMLInputElement;
    expect(marInput).not.toBeDisabled();
    expect(marInput.value).toBe('400000');
  });

  it('育休期間が無くなれば(leavePeriodsが空配列に変わる)、対象月は即座に編集可能に戻る(H-1回帰テスト)', () => {
    const monthly = makeMonthly();
    const leavePeriods: LeavePeriod[] = [{ type: 'childcare', startYm: '2026-01', endYm: '2026-02', benefitAmount: 100_000 }];
    const { rerender } = render(<MonthlyIncomeGrid monthly={monthly} leavePeriods={leavePeriods} year={2026} onChange={vi.fn()} />);
    expect(screen.getByLabelText('1月の給与')).toBeDisabled();

    rerender(<MonthlyIncomeGrid monthly={monthly} leavePeriods={[]} year={2026} onChange={vi.fn()} />);
    const janInput = screen.getByLabelText('1月の給与') as HTMLInputElement;
    expect(janInput).not.toBeDisabled();
    expect(janInput.value).toBe('400000');
  });
});
