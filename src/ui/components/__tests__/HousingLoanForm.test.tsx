// @vitest-environment jsdom
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { HousingLoanForm } from '../HousingLoanForm';
import type { HousingLoanInput } from '../../../domain/types';

afterEach(cleanup);

const loan: HousingLoanInput = {
  moveInYear: 2023,
  years: 13,
  rate: 0.007,
  yearEndBalance: 32_000_000,
  borrowingCap: 40_000_000,
  residentTaxCapRule: 'rule5pct97500',
};

/** 実際の画面同様、onChangeの結果を折り返してvalueに反映する制御コンポーネント。控除率欄の
 *  キー入力ごとのparse→format往復(レビュー指摘#1)は、onChangeを素通りのvi.fn()にするテストでは
 *  再現できない(valueが変わらないため表示も変わらない)ため、この折り返しが必須。 */
function ControlledWrapper({ initial }: { initial: HousingLoanInput }) {
  const [value, setValue] = useState<HousingLoanInput | undefined>(initial);
  return <HousingLoanForm value={value} year={2026} previousYearBalance={undefined} onChange={(v) => setValue(v ?? undefined)} />;
}

describe('HousingLoanForm(Issue #8)', () => {
  it('未入力時はトグルのみ表示され、入力欄は表示されない', () => {
    render(<HousingLoanForm value={undefined} year={2026} previousYearBalance={undefined} onChange={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: '住宅ローン控除の対象である' })).not.toBeChecked();
    expect(screen.queryByLabelText('年末残高')).not.toBeInTheDocument();
  });

  it('トグルをONにすると対象年をmoveInYearとした既定値でonChangeが呼ばれる', () => {
    const onChange = vi.fn();
    render(<HousingLoanForm value={undefined} year={2026} previousYearBalance={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '住宅ローン控除の対象である' }));
    expect(onChange).toHaveBeenCalledWith({
      moveInYear: 2026,
      years: 13,
      rate: 0.007,
      yearEndBalance: 0,
      borrowingCap: 0,
      residentTaxCapRule: 'rule5pct97500',
    });
  });

  it('2021年以前の年度でトグルをONにすると、既定のルールがrule7pct136500になる(レビュー指摘#2是正: 入居年とルールの矛盾防止)', () => {
    const onChange = vi.fn();
    render(<HousingLoanForm value={undefined} year={2019} previousYearBalance={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '住宅ローン控除の対象である' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ moveInYear: 2019, residentTaxCapRule: 'rule7pct136500' }));
  });

  it('トグルをOFFにするとonChange(null)が呼ばれる', () => {
    const onChange = vi.fn();
    render(<HousingLoanForm value={loan} year={2026} previousYearBalance={undefined} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: '住宅ローン控除の対象である' }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('年末残高・借入限度額の編集がonChangeに反映される', () => {
    const onChange = vi.fn();
    render(<HousingLoanForm value={loan} year={2026} previousYearBalance={undefined} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText('年末残高'), { target: { value: '30000000' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...loan, yearEndBalance: 30_000_000 });

    fireEvent.change(screen.getByLabelText('借入限度額'), { target: { value: '35000000' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...loan, borrowingCap: 35_000_000 });
  });

  it('控除率はパーセント表示("0.7")で編集し、小数(0.007)に変換してonChangeに渡す', () => {
    const onChange = vi.fn();
    render(<HousingLoanForm value={loan} year={2026} previousYearBalance={undefined} onChange={onChange} />);

    expect(screen.getByLabelText('控除率')).toHaveValue('0.7');
    fireEvent.change(screen.getByLabelText('控除率'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...loan, rate: 0.01 });
  });

  it('控除率欄は1キーずつの入力でも歪まない(レビュー指摘#1是正: "1"→"."→"4"の入力で0.14ではなく0.014になる)', async () => {
    const user = userEvent.setup();
    render(<ControlledWrapper initial={loan} />);

    const rateInput = screen.getByLabelText('控除率');
    await user.clear(rateInput);
    await user.type(rateInput, '1.4');

    expect(rateInput).toHaveValue('1.4');
  });

  it('既存値の末尾を1文字消してから打ち直しても歪まない(レビュー2巡目是正: "0.7"→Backspace→"9"で"0.9"になり0.9(誤って0.09)にならない)', async () => {
    const user = userEvent.setup();
    render(<ControlledWrapper initial={loan} />);

    const rateInput = screen.getByLabelText('控除率');
    expect(rateInput).toHaveValue('0.7');
    await user.type(rateInput, '{End}{Backspace}9');

    expect(rateInput).toHaveValue('0.9');
  });

  it('入居年を編集すると、ルールが未変更(既定値のまま)であれば新しい入居年の既定ルールに追従する(レビュー3巡目是正)', () => {
    const onChange = vi.fn();
    // loan.moveInYear=2023はrule5pct97500が既定(2022年以降)のケース
    render(<HousingLoanForm value={loan} year={2026} previousYearBalance={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('入居年'), { target: { value: '2019' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...loan, moveInYear: 2019, residentTaxCapRule: 'rule7pct136500' });
  });

  it('ルールを<select>で手動選択した後は、入居年を変更してもルールを上書きしない', () => {
    render(<ControlledWrapper initial={loan} />);
    // loan.moveInYear=2023の既定はrule5pct97500。これと異なるrule7pct136500へ手動で切り替える
    fireEvent.change(screen.getByLabelText('住民税繰越上限ルール'), { target: { value: 'rule7pct136500' } });
    // 入居年を2026(既定はrule5pct97500)へ変更しても、手動選択したルールは上書きされない
    fireEvent.change(screen.getByLabelText('入居年'), { target: { value: '2026' } });
    expect(screen.getByLabelText('住民税繰越上限ルール')).toHaveValue('rule7pct136500');
  });

  it('ルールを手動選択していなければ、入居年を複数回編集しても経路に依存せず最終的な入居年の既定ルールになる(レビュー4巡目是正: 経路依存バグの解消)', () => {
    // moveInYear=2020は既定でrule7pct136500だが、ここではrule5pct97500(インポート等で既に矛盾した状態を想定)
    const inconsistent: HousingLoanInput = { ...loan, moveInYear: 2020, residentTaxCapRule: 'rule5pct97500' };

    // 経路A: 2020→2021 (1回で編集)
    const { unmount } = render(<ControlledWrapper initial={inconsistent} />);
    fireEvent.change(screen.getByLabelText('入居年'), { target: { value: '2021' } });
    const ruleA = (screen.getByLabelText('住民税繰越上限ルール') as HTMLSelectElement).value;
    unmount();

    // 経路B: 2020→2025→2021 (2回に分けて編集。2025年の既定はrule5pct97500 = 開始時の値と偶然一致する)
    render(<ControlledWrapper initial={inconsistent} />);
    fireEvent.change(screen.getByLabelText('入居年'), { target: { value: '2025' } });
    fireEvent.change(screen.getByLabelText('入居年'), { target: { value: '2021' } });
    const ruleB = (screen.getByLabelText('住民税繰越上限ルール') as HTMLSelectElement).value;

    expect(ruleA).toBe('rule7pct136500');
    expect(ruleB).toBe('rule7pct136500');
    expect(ruleA).toBe(ruleB);
  });

  it('住民税繰越上限ルールの選択切替がonChangeに反映される', () => {
    const onChange = vi.fn();
    render(<HousingLoanForm value={loan} year={2026} previousYearBalance={undefined} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('住民税繰越上限ルール'), { target: { value: 'rule7pct136500' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...loan, residentTaxCapRule: 'rule7pct136500' });
  });

  it('借入限度額の説明(何の値か・控除額の式・調べ方)が表示される(Issue #50)', () => {
    render(<HousingLoanForm value={loan} year={2026} previousYearBalance={undefined} onChange={vi.fn()} />);

    const help = document.getElementById('borrowing-cap-help');
    expect(help).not.toBeNull();
    expect(help!.textContent).toContain('控除の対象にできる年末残高の上限額');
    expect(help!.textContent).toContain('min(年末残高, 借入限度額) × 控除率');
    expect(help!.textContent).toContain('住宅借入金等特別控除');
    // 入力欄と説明が支援技術上も紐づいていること
    expect(screen.getByLabelText('借入限度額')).toHaveAttribute('aria-describedby', 'borrowing-cap-help');
  });

  it('控除対象残高は年末残高と借入限度額の小さい方を表示する(Issue #50)', () => {
    render(
      <HousingLoanForm value={{ ...loan, yearEndBalance: 45_000_000, borrowingCap: 40_000_000 }} year={2026} previousYearBalance={undefined} onChange={vi.fn()} />
    );
    expect(document.getElementById('borrowing-cap-help')!.textContent).toContain('40,000,000円');
  });

  it('借入限度額が0円のときは控除額が0円になる旨を注意表示する(Issue #50: 既定値のまま気づかず0円で計算されるのを防ぐ)', () => {
    const { unmount } = render(
      <HousingLoanForm value={{ ...loan, borrowingCap: 0 }} year={2026} previousYearBalance={undefined} onChange={vi.fn()} />
    );
    expect(document.getElementById('borrowing-cap-help')!.textContent).toContain('住宅ローン控除額は0円として計算されます');
    unmount();

    render(<HousingLoanForm value={loan} year={2026} previousYearBalance={undefined} onChange={vi.fn()} />);
    expect(document.getElementById('borrowing-cap-help')!.textContent).not.toContain('住宅ローン控除額は0円として計算されます');
  });

  it('前年より年末残高が増加している場合、警告が表示される(02仕様書§6バリデーション)', () => {
    render(<HousingLoanForm value={{ ...loan, yearEndBalance: 35_000_000 }} year={2026} previousYearBalance={32_000_000} onChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('年末残高が前年');
  });

  it('前年以下であれば警告は表示されない', () => {
    render(<HousingLoanForm value={{ ...loan, yearEndBalance: 30_000_000 }} year={2026} previousYearBalance={32_000_000} onChange={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('前年データが無い場合は増加警告を出さない', () => {
    render(<HousingLoanForm value={loan} year={2026} previousYearBalance={undefined} onChange={vi.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
