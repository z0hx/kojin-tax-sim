// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { MedicalDeductionForm } from '../MedicalDeductionForm';
import type { MedicalInput, Yen } from '../../../domain/types';

afterEach(cleanup);

const PARAMS = {
  thresholdFixed: 100_000,
  thresholdIncomeRatio: 0.05,
  cap: 2_000_000,
  selfMedicationDeductible: 12_000,
  selfMedicationCap: 88_000,
};

function baseValue(): MedicalInput {
  return { paid: 0, reimbursed: 0, selfMedication: 0, mode: 'auto' };
}

describe('MedicalDeductionForm', () => {
  it('総所得金額等が200万円未満の場合、足切り額は総所得×5%が採用されたと表示する(FR-06)', () => {
    render(
      <MedicalDeductionForm value={baseValue()} totalIncome={1_000_000 as Yen} params={PARAMS} oneStopSelected={false} onChange={vi.fn()} />
    );
    expect(screen.getByText(/50,000円/)).toBeInTheDocument();
    expect(screen.getByText(/総所得金額等×5%が10万円を下回るため採用/)).toBeInTheDocument();
  });

  it('総所得金額等が200万円以上の場合、定額10万円が採用されたと表示する', () => {
    render(
      <MedicalDeductionForm value={baseValue()} totalIncome={5_000_000 as Yen} params={PARAMS} oneStopSelected={false} onChange={vi.fn()} />
    );
    expect(screen.getByText(/定額10万円を採用/)).toBeInTheDocument();
  });

  it('セルフメディケーション税制の方が有利な場合、自動判定でchosenMode=セルフメディケーションと表示する', () => {
    const value: MedicalInput = { paid: 0, reimbursed: 0, selfMedication: 50_000, mode: 'auto' };
    render(<MedicalDeductionForm value={value} totalIncome={5_000_000 as Yen} params={PARAMS} oneStopSelected={false} onChange={vi.fn()} />);
    expect(screen.getByText(/採用方式: セルフメディケーション税制/)).toBeInTheDocument();
  });

  it('補填金額が支払医療費を超える編集はブロックされ、onChangeが呼ばれない', () => {
    const onChange = vi.fn();
    const value: MedicalInput = { paid: 100_000, reimbursed: 0, selfMedication: 0, mode: 'auto' };
    render(<MedicalDeductionForm value={value} totalIncome={5_000_000 as Yen} params={PARAMS} oneStopSelected={false} onChange={onChange} />);

    const reimbursedInput = screen.getByLabelText('補填金額');
    fireEvent.change(reimbursedInput, { target: { value: '150000' } });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('補填金額が支払医療費を超えています');
    // ユーザーが入力した文字列自体は表示され続ける(巻き戻らない)
    expect(reimbursedInput).toHaveValue('150000');
  });

  it('既に不整合(reimbursed>paid)なデータでも、支払医療費を引き上げれば是正できる(2巡目レビュー対応)', async () => {
    const onChange = vi.fn();
    const value: MedicalInput = { paid: 50_000, reimbursed: 80_000, selfMedication: 0, mode: 'auto' };
    render(<MedicalDeductionForm value={value} totalIncome={5_000_000 as Yen} params={PARAMS} oneStopSelected={false} onChange={onChange} />);

    const paidInput = screen.getByLabelText('支払医療費');
    await userEvent.clear(paidInput);
    await userEvent.type(paidInput, '100000');

    // 途中の値(1,10,100,...,10000)は全てreimbursed(80,000)を下回り無効なため、
    // 有効な組み合わせに達する最後の1桁目でのみコミットされる
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenLastCalledWith({ ...value, paid: 100000, reimbursed: 80_000 });
  });

  it('oneStopSelectedかつ支払医療費>0の場合、ワンストップ特例が使えない旨の警告を表示する', () => {
    const value: MedicalInput = { paid: 50_000, reimbursed: 0, selfMedication: 0, mode: 'auto' };
    render(<MedicalDeductionForm value={value} totalIncome={5_000_000 as Yen} params={PARAMS} oneStopSelected onChange={vi.fn()} />);
    expect(screen.getByText(/ワンストップ特例は利用できません/)).toBeInTheDocument();
  });

  it('oneStopSelectedでも支払医療費が0なら警告を表示しない', () => {
    render(<MedicalDeductionForm value={baseValue()} totalIncome={5_000_000 as Yen} params={PARAMS} oneStopSelected onChange={vi.fn()} />);
    expect(screen.queryByText(/ワンストップ特例は利用できません/)).not.toBeInTheDocument();
  });
});
