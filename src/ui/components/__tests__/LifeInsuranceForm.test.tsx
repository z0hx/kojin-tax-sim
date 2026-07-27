// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LifeInsuranceForm } from '../LifeInsuranceForm';
import type { LifeInsuranceInput } from '../../../domain/types';

afterEach(cleanup);

function baseValue(): LifeInsuranceInput {
  return { new: { general: 0, nursing: 0, pension: 0 }, old: { general: 0, pension: 0 }, hasChildUnder23: false };
}

describe('LifeInsuranceForm', () => {
  it('新制度・一般を編集するとonChangeが呼ばれる', () => {
    const onChange = vi.fn();
    render(<LifeInsuranceForm value={baseValue()} childUnder23CapApplicable onChange={onChange} />);
    const input = screen.getByLabelText('新・一般', { selector: 'input' });
    fireEvent.change(input, { target: { value: '30000' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...baseValue(), new: { ...baseValue().new, general: 30000 } });
  });

  it('childUnder23CapApplicable=falseの場合はトグルが無効化され、対象外の注記が出る', () => {
    render(<LifeInsuranceForm value={baseValue()} childUnder23CapApplicable={false} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /23歳未満/ })).toBeDisabled();
    expect(screen.getByText('この年度は対象外の措置です。')).toBeInTheDocument();
  });

  it('childUnder23CapApplicable=trueの場合はトグルが有効で、住民税には影響しない旨の注記が出る', () => {
    render(<LifeInsuranceForm value={baseValue()} childUnder23CapApplicable onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: /23歳未満/ })).not.toBeDisabled();
    expect(screen.getByText(/住民税の控除額は変わりません/)).toBeInTheDocument();
  });
});
