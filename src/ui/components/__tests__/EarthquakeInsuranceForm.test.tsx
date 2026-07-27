// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EarthquakeInsuranceForm } from '../EarthquakeInsuranceForm';

afterEach(cleanup);

describe('EarthquakeInsuranceForm', () => {
  it('本体・旧長期損害保険料それぞれの編集でonChangeが呼ばれる', () => {
    const onChange = vi.fn();
    render(<EarthquakeInsuranceForm value={{ long: 0, short: 0 }} onChange={onChange} />);

    const longInput = screen.getByLabelText('地震保険料(本体)');
    fireEvent.change(longInput, { target: { value: '40000' } });
    expect(onChange).toHaveBeenLastCalledWith({ long: 40000, short: 0 });

    const shortInput = screen.getByLabelText('旧長期損害保険料');
    fireEvent.change(shortInput, { target: { value: '10000' } });
    expect(onChange).toHaveBeenLastCalledWith({ long: 0, short: 10000 });
  });
});
