// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { SpouseDependentForm } from '../SpouseDependentForm';
import type { Dependent } from '../../../domain/types';

afterEach(cleanup);

describe('SpouseDependentForm', () => {
  it('配偶者トグルをONにすると初期値{totalIncome:0}でonChangeSpouseが呼ばれ、入力欄が現れる', async () => {
    const onChangeSpouse = vi.fn();
    render(<SpouseDependentForm spouse={undefined} dependents={[]} onChangeSpouse={onChangeSpouse} onChangeDependents={vi.fn()} />);
    await userEvent.click(screen.getByRole('checkbox', { name: /配偶者控除・配偶者特別控除の対象とする/ }));
    expect(onChangeSpouse).toHaveBeenCalledWith({ totalIncome: 0, isElderly: false });
  });

  it('配偶者トグルをOFFにするとonChangeSpouse(undefined)が呼ばれる', async () => {
    const onChangeSpouse = vi.fn();
    render(
      <SpouseDependentForm
        spouse={{ totalIncome: 300_000, isElderly: false }}
        dependents={[]}
        onChangeSpouse={onChangeSpouse}
        onChangeDependents={vi.fn()}
      />
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /配偶者控除・配偶者特別控除の対象とする/ }));
    expect(onChangeSpouse).toHaveBeenCalledWith(undefined);
  });

  it('扶養親族を追加できる(70歳未満は同居老親等チェックが無効)', async () => {
    const onChangeDependents = vi.fn();
    render(<SpouseDependentForm spouse={undefined} dependents={[]} onChangeSpouse={vi.fn()} onChangeDependents={onChangeDependents} />);

    expect(screen.getByRole('checkbox', { name: '同居老親等' })).toBeDisabled();

    const ageInput = screen.getByLabelText('年齢');
    await userEvent.clear(ageInput);
    await userEvent.type(ageInput, '20');
    await userEvent.click(screen.getByRole('button', { name: '＋ 扶養親族を追加' }));

    expect(onChangeDependents).toHaveBeenCalledTimes(1);
    const added = onChangeDependents.mock.calls[0][0] as Dependent[];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ age: 20, isCoresidentElderlyParent: undefined });
    expect(added[0].id).toEqual(expect.any(String));
  });

  it('年齢が不正な場合は追加せずエラーを表示する', async () => {
    const onChangeDependents = vi.fn();
    render(<SpouseDependentForm spouse={undefined} dependents={[]} onChangeSpouse={vi.fn()} onChangeDependents={onChangeDependents} />);
    const ageInput = screen.getByLabelText('年齢');
    await userEvent.clear(ageInput);
    await userEvent.type(ageInput, '-1');
    await userEvent.click(screen.getByRole('button', { name: '＋ 扶養親族を追加' }));
    expect(onChangeDependents).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('年齢は0以上の整数で入力してください');
  });

  it('70歳以上を入力すると同居老親等チェックが有効になり、追加時に反映される', async () => {
    const onChangeDependents = vi.fn();
    render(<SpouseDependentForm spouse={undefined} dependents={[]} onChangeSpouse={vi.fn()} onChangeDependents={onChangeDependents} />);
    const ageInput = screen.getByLabelText('年齢');
    await userEvent.clear(ageInput);
    await userEvent.type(ageInput, '75');
    const coresidentCheckbox = screen.getByRole('checkbox', { name: '同居老親等' });
    expect(coresidentCheckbox).not.toBeDisabled();
    await userEvent.click(coresidentCheckbox);
    await userEvent.click(screen.getByRole('button', { name: '＋ 扶養親族を追加' }));
    const added = onChangeDependents.mock.calls[0][0] as Dependent[];
    expect(added[0]).toMatchObject({ age: 75, isCoresidentElderlyParent: true });
  });

  it('扶養親族を削除できる', async () => {
    const onChangeDependents = vi.fn();
    const dependents: Dependent[] = [{ id: 'd1', age: 20 }];
    render(<SpouseDependentForm spouse={undefined} dependents={dependents} onChangeSpouse={vi.fn()} onChangeDependents={onChangeDependents} />);
    await userEvent.click(screen.getByRole('button', { name: '削除' }));
    expect(onChangeDependents).toHaveBeenCalledWith([]);
  });
});
