// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { AmountInput } from '../AmountInput';

afterEach(cleanup);

describe('AmountInput', () => {
  it('カンマ区切りのペーストを0以上の整数としてonChangeへ渡す', () => {
    const onChange = vi.fn();
    render(<AmountInput value={0} onChange={onChange} ariaLabel="金額" />);
    const input = screen.getByLabelText('金額');
    fireEvent.change(input, { target: { value: '1,000,000' } });
    expect(onChange).toHaveBeenLastCalledWith(1000000);
  });

  it('値が0のときフォーカスすると表示が空になる', () => {
    render(<AmountInput value={0} onChange={vi.fn()} ariaLabel="金額" />);
    const input = screen.getByLabelText('金額') as HTMLInputElement;
    expect(input.value).toBe('0');
    fireEvent.focus(input);
    expect(input.value).toBe('');
  });

  it('値が0以外のときフォーカスしても表示は消えない', () => {
    render(<AmountInput value={500} onChange={vi.fn()} ariaLabel="金額" />);
    const input = screen.getByLabelText('金額') as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.value).toBe('500');
  });

  it('空のままフォーカスを外すと直近の値に表示を戻す', () => {
    render(<AmountInput value={0} onChange={vi.fn()} ariaLabel="金額" />);
    const input = screen.getByLabelText('金額') as HTMLInputElement;
    fireEvent.focus(input);
    expect(input.value).toBe('');
    fireEvent.blur(input);
    expect(input.value).toBe('0');
  });
});
