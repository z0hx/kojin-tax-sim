// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { BonusEditor } from '../BonusEditor';
import type { Bonus, LeavePeriod } from '../../../domain/types';

afterEach(cleanup);

describe('BonusEditor', () => {
  it('賞与を追加できる(2ヶ月以上の育休期間外の月なのでisExempt=false)', async () => {
    const onChange = vi.fn();
    render(<BonusEditor bonuses={[]} leavePeriods={[]} year={2026} onChange={onChange} />);

    await userEvent.type(screen.getByLabelText('名称'), '夏季賞与');
    await userEvent.selectOptions(screen.getByLabelText('支給月'), '6');
    await userEvent.clear(screen.getByLabelText('総支給額(円)'));
    await userEvent.type(screen.getByLabelText('総支給額(円)'), '500000');
    await userEvent.click(screen.getByRole('button', { name: '＋ 賞与を追加' }));

    expect(onChange).toHaveBeenCalledWith([
      { label: '夏季賞与', month: 6, status: 'estimated', gross: 500000, socialInsurance: 0, isExempt: false },
    ]);
  });

  it('名称未入力ではエラーになりonChangeが呼ばれない', async () => {
    const onChange = vi.fn();
    render(<BonusEditor bonuses={[]} leavePeriods={[]} year={2026} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '＋ 賞与を追加' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('名称を入力してください');
  });

  it('育休対象月の賞与は免除表示になるが、給与総支給額はそのまま表示される(社保のみ0扱い)', () => {
    // 2ヶ月以上の育休期間(isLongLeave)に賞与月(12月)が含まれるケース
    const winterLeave: LeavePeriod[] = [{ type: 'childcare', startYm: '2026-11', endYm: '2026-12', benefitAmount: 0 }];
    const bonuses: Bonus[] = [{ label: '冬季賞与', month: 12, status: 'actual', gross: 500_000, socialInsurance: 80_000, isExempt: false }];
    render(<BonusEditor bonuses={bonuses} leavePeriods={winterLeave} year={2026} onChange={vi.fn()} />);

    expect(screen.getByText('500,000円')).toBeInTheDocument(); // 給与総支給額は0にならない
    expect(screen.getByText('0円')).toBeInTheDocument(); // 社会保険料は0表示
    expect(screen.getByText('社保免除(育休)')).toBeInTheDocument();
  });

  it('賞与を削除できる', async () => {
    const bonuses: Bonus[] = [{ label: '夏季賞与', month: 6, status: 'actual', gross: 500_000, socialInsurance: 0, isExempt: false }];
    const onChange = vi.fn();
    render(<BonusEditor bonuses={bonuses} leavePeriods={[]} year={2026} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });
});
