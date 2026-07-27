// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { SocialInsuranceOverrideField } from '../SocialInsuranceOverrideField';
import type { Yen } from '../../../domain/types';

afterEach(cleanup);

describe('SocialInsuranceOverrideField', () => {
  it('未上書き時は自動集計値を表示し、チェックボックスはoff', () => {
    render(<SocialInsuranceOverrideField actualSum={500_000 as Yen} value={undefined} onChange={vi.fn()} />);
    expect(screen.getByText(/500,000円/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /上書きする/ })).not.toBeChecked();
    expect(screen.queryByLabelText('社会保険料(上書き)')).not.toBeInTheDocument();
  });

  it('チェックをonにすると自動集計値を初期値としてonChangeが呼ばれる', async () => {
    const onChange = vi.fn();
    render(<SocialInsuranceOverrideField actualSum={500_000 as Yen} value={undefined} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /上書きする/ }));
    expect(onChange).toHaveBeenCalledWith(500_000);
  });

  it('value(props)がセットされている場合は上書き入力欄が表示される', () => {
    render(<SocialInsuranceOverrideField actualSum={500_000 as Yen} value={600_000} onChange={vi.fn()} />);
    expect(screen.getByLabelText('社会保険料(上書き)')).toBeInTheDocument();
  });

  it('チェックをoffにするとonChange(undefined)が呼ばれる', async () => {
    const onChange = vi.fn();
    render(<SocialInsuranceOverrideField actualSum={500_000 as Yen} value={600_000} onChange={onChange} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /上書きする/ }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });

  it('上書き入力欄の値を変更するとonChangeが呼ばれる', async () => {
    const onChange = vi.fn();
    render(<SocialInsuranceOverrideField actualSum={500_000 as Yen} value={600_000} onChange={onChange} />);
    const input = screen.getByLabelText('社会保険料(上書き)');
    await userEvent.clear(input);
    await userEvent.type(input, '700000');
    expect(onChange).toHaveBeenLastCalledWith(700000);
  });
});
