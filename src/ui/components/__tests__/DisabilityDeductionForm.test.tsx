// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { DisabilityDeductionForm } from '../DisabilityDeductionForm';
import type { DisabilityInput } from '../../../domain/types';

afterEach(cleanup);

describe('DisabilityDeductionForm', () => {
  it('区分を選んで追加できる(デフォルトは一般)', async () => {
    const onChange = vi.fn();
    render(<DisabilityDeductionForm value={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '＋ 追加' }));
    expect(onChange).toHaveBeenCalledWith([{ severity: 'general' }]);
  });

  it('特別障害者を選択して追加できる', async () => {
    const onChange = vi.fn();
    render(<DisabilityDeductionForm value={[]} onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText('区分'), '特別障害者');
    await userEvent.click(screen.getByRole('button', { name: '＋ 追加' }));
    expect(onChange).toHaveBeenCalledWith([{ severity: 'special' }]);
  });

  it('一覧から削除できる', async () => {
    const onChange = vi.fn();
    const value: DisabilityInput[] = [{ severity: 'general' }, { severity: 'specialCoresident' }];
    render(<DisabilityDeductionForm value={value} onChange={onChange} />);
    const removeButtons = screen.getAllByRole('button', { name: '削除' });
    await userEvent.click(removeButtons[0]);
    expect(onChange).toHaveBeenCalledWith([{ severity: 'specialCoresident' }]);
  });
});
