// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { LeavePeriodEditor } from '../LeavePeriodEditor';
import type { LeavePeriod } from '../../../domain/types';

afterEach(cleanup);

describe('LeavePeriodEditor', () => {
  it('プルダウンで開始月・終了月・種別・給付金額を指定して追加できる', async () => {
    const onChange = vi.fn();
    render(<LeavePeriodEditor leavePeriods={[]} year={2026} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('種別'), '育児休業');
    await userEvent.selectOptions(screen.getByLabelText('開始月'), '1');
    await userEvent.selectOptions(screen.getByLabelText('終了月'), '3');
    await userEvent.clear(screen.getByLabelText('給付金額(円)'));
    await userEvent.type(screen.getByLabelText('給付金額(円)'), '300000');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(onChange).toHaveBeenCalledWith([{ type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 300000 }]);
  });

  it('ドラッグ操作(mousedown→mouseenter→mouseup)でプルダウンの開始月・終了月が更新される', () => {
    render(<LeavePeriodEditor leavePeriods={[]} year={2026} onChange={vi.fn()} />);

    fireEvent.mouseDown(screen.getByTestId('leave-drag-cell-2'));
    fireEvent.mouseEnter(screen.getByTestId('leave-drag-cell-5'));
    fireEvent.mouseUp(screen.getByTestId('leave-drag-cell-5'));

    expect(screen.getByLabelText('開始月')).toHaveValue('2');
    expect(screen.getByLabelText('終了月')).toHaveValue('5');
  });

  it('既存期間と月が重複する新規期間の追加はエラーになりonChangeが呼ばれない', async () => {
    const existing: LeavePeriod[] = [{ type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 0 }];
    const onChange = vi.fn();
    render(<LeavePeriodEditor leavePeriods={existing} year={2026} onChange={onChange} />);

    await userEvent.selectOptions(screen.getByLabelText('開始月'), '3');
    await userEvent.selectOptions(screen.getByLabelText('終了月'), '4');
    await userEvent.click(screen.getByRole('button', { name: '追加' }));

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('重複しています');
  });

  it('既存期間の一覧から削除できる', async () => {
    const existing: LeavePeriod[] = [{ type: 'maternity', startYm: '2026-04', endYm: '2026-05', benefitAmount: 50_000 }];
    const onChange = vi.fn();
    render(<LeavePeriodEditor leavePeriods={existing} year={2026} onChange={onChange} />);

    await userEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(onChange).toHaveBeenCalledWith([]);
  });

  it('保存済みの期間同士が重複している場合は警告バナーを表示する(インポート等での混入検知)', () => {
    const existing: LeavePeriod[] = [
      { type: 'childcare', startYm: '2026-01', endYm: '2026-03', benefitAmount: 0 },
      { type: 'other', startYm: '2026-02', endYm: '2026-04', benefitAmount: 0 },
    ];
    render(<LeavePeriodEditor leavePeriods={existing} year={2026} onChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('重複しています');
  });
});
