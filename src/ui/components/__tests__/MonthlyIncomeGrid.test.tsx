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

  it('既定は一括入力で、社会保険料の入力欄が1つだけ表示される(Issue #48)', () => {
    render(<MonthlyIncomeGrid monthly={makeMonthly()} leavePeriods={[]} year={2026} onChange={vi.fn()} />);

    expect(screen.getByLabelText('3月の社会保険料の入力方法')).toHaveValue('total');
    expect(screen.getByLabelText('3月の社会保険料')).toHaveValue('60000');
    expect(screen.queryByLabelText('3月の健康保険料')).not.toBeInTheDocument();
  });

  it('入力方法を内訳入力に切り替えるとその月だけモードが変わる(Issue #48: 月ごとに選べる)', () => {
    const onChange = vi.fn();
    render(<MonthlyIncomeGrid monthly={makeMonthly()} leavePeriods={[]} year={2026} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('3月の社会保険料の入力方法'), { target: { value: 'breakdown' } });

    const updated = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MonthlyRecord[];
    const march = updated.find((m) => m.month === 3);
    expect(march?.socialInsuranceInputMode).toBe('breakdown');
    // モードだけ立って内訳が無い状態は作らない(計算に使われる値と画面表示が食い違わないようにする)
    expect(march?.socialInsuranceBreakdown).toEqual({ healthInsurance: 0, nursingCare: 0, pension: 0, employmentInsurance: 0, other: 0 });
    expect(updated.find((m) => m.month === 4)?.socialInsuranceInputMode).toBeUndefined();
    // 一括入力額は保持する(一括入力に戻したときに復元するため)
    expect(march?.socialInsurance).toBe(60_000);
  });

  it('一括入力に戻しても内訳は保持され、再度切り替えると復元される(Issue #48)', () => {
    const breakdown = { healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 };
    const monthly = makeMonthly().map((m) =>
      m.month === 3 ? { ...m, socialInsuranceInputMode: 'breakdown' as const, socialInsuranceBreakdown: breakdown } : m
    );
    const onChange = vi.fn();
    render(<MonthlyIncomeGrid monthly={monthly} leavePeriods={[]} year={2026} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('3月の社会保険料の入力方法'), { target: { value: 'total' } });

    const updated = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MonthlyRecord[];
    expect(updated.find((m) => m.month === 3)?.socialInsuranceInputMode).toBe('total');
    expect(updated.find((m) => m.month === 3)?.socialInsuranceBreakdown).toEqual(breakdown);
  });

  it('モードだけ内訳入力で内訳が無い取り込みデータは一括入力として表示する(計算に使われる値と一致させる)', () => {
    const monthly = makeMonthly().map((m) => (m.month === 3 ? { ...m, socialInsuranceInputMode: 'breakdown' as const } : m));
    render(<MonthlyIncomeGrid monthly={monthly} leavePeriods={[]} year={2026} onChange={vi.fn()} />);

    expect(screen.getByLabelText('3月の社会保険料の入力方法')).toHaveValue('total');
    expect(screen.getByLabelText('3月の社会保険料')).toHaveValue('60000');
  });

  it('内訳入力の月は項目ごとの欄と合計を表示し、編集が内訳に反映される(Issue #48)', () => {
    const monthly = makeMonthly().map((m) =>
      m.month === 3
        ? {
            ...m,
            socialInsuranceInputMode: 'breakdown' as const,
            socialInsuranceBreakdown: { healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 },
          }
        : m
    );
    const onChange = vi.fn();
    render(<MonthlyIncomeGrid monthly={monthly} leavePeriods={[]} year={2026} onChange={onChange} />);

    expect(screen.getByLabelText('3月の健康保険料')).toHaveValue('20000');
    expect(screen.getByLabelText('3月の厚生年金保険料')).toHaveValue('36000');
    expect(screen.queryByLabelText('3月の社会保険料')).not.toBeInTheDocument();
    expect(screen.getByText('58,000円')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('3月の介護保険料'), { target: { value: '5000' } });

    const updated = onChange.mock.calls[onChange.mock.calls.length - 1][0] as MonthlyRecord[];
    expect(updated.find((m) => m.month === 3)?.socialInsuranceBreakdown).toEqual({
      healthInsurance: 20_000,
      nursingCare: 5_000,
      pension: 36_000,
      employmentInsurance: 2_000,
      other: 0,
    });
  });

  it('内訳が未入力のまま内訳入力に切り替えた月は、0円で計算される旨を注意表示する(Issue #48)', () => {
    const monthly = makeMonthly().map((m) =>
      m.month === 3
        ? {
            ...m,
            socialInsuranceInputMode: 'breakdown' as const,
            socialInsuranceBreakdown: { healthInsurance: 0, nursingCare: 0, pension: 0, employmentInsurance: 0, other: 0 },
          }
        : m
    );
    render(<MonthlyIncomeGrid monthly={monthly} leavePeriods={[]} year={2026} onChange={vi.fn()} />);

    expect(screen.getByText(/内訳が未入力のため0円として計算されます/)).toBeInTheDocument();
  });

  it('育休対象月は内訳入力を選んでいても0円固定の一括入力欄を表示する(Issue #48)', () => {
    const monthly = makeMonthly().map((m) =>
      m.month === 1
        ? {
            ...m,
            socialInsuranceInputMode: 'breakdown' as const,
            socialInsuranceBreakdown: { healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 },
          }
        : m
    );
    const leavePeriods: LeavePeriod[] = [{ type: 'childcare', startYm: '2026-01', endYm: '2026-02', benefitAmount: 100_000 }];
    render(<MonthlyIncomeGrid monthly={monthly} leavePeriods={leavePeriods} year={2026} onChange={vi.fn()} />);

    const janInput = screen.getByLabelText('1月の社会保険料') as HTMLInputElement;
    expect(janInput).toBeDisabled();
    expect(janInput.value).toBe('0');
    expect(screen.getByLabelText('1月の社会保険料の入力方法')).toBeDisabled();
    expect(screen.queryByLabelText('1月の健康保険料')).not.toBeInTheDocument();
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
