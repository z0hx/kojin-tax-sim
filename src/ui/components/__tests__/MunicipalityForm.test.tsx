// @vitest-environment jsdom
/**
 * 自治体設定フォーム(Issue #38でオンボーディングから切り出した共通コンポーネント)のテスト。
 * 変換・検証のヘルパは表示と独立に検証できるため、描画テストと分けて確認する。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import { MunicipalityForm, draftToConfig, hasDraftError, toDraft, validateDraft } from '../MunicipalityForm';
import { yokohamaMunicipality } from '../../../store/__tests__/testUtils';

describe('MunicipalityForm のヘルパ', () => {
  it('toDraft/draftToConfigが往復しても値が変わらない', () => {
    const config = yokohamaMunicipality();
    expect(draftToConfig(toDraft(config), config)).toEqual(config);
  });

  it('パーセント表示は比率へ丸め誤差なく変換される', () => {
    const base = yokohamaMunicipality();
    const draft = { ...toDraft(base), prefecturalRatePct: '4.025' };
    expect(draftToConfig(draft, base)!.prefecturalIncomeRate).toBe(0.04025);
  });

  it('編集対象外のforestTax/useStandardRateForFurusatoはbaseから引き継ぐ', () => {
    const base = { ...yokohamaMunicipality(), forestTax: 1000, useStandardRateForFurusato: false };
    const config = draftToConfig({ ...toDraft(base), cityName: '川崎市' }, base)!;
    expect(config.forestTax).toBe(1000);
    expect(config.useStandardRateForFurusato).toBe(false);
  });

  it('空文字・負値・非数はエラーになりnullを返す(既定値へフォールバックしない)', () => {
    const base = yokohamaMunicipality();
    for (const bad of ['', '  ', '-1', 'abc']) {
      const draft = { ...toDraft(base), municipalRatePct: bad };
      expect(validateDraft(draft).municipalRate).toBe('0以上の数値を入力してください');
      expect(hasDraftError(validateDraft(draft))).toBe(true);
      expect(draftToConfig(draft, base)).toBeNull();
    }
  });

  it('均等割は小数を受け付けない', () => {
    const base = yokohamaMunicipality();
    const draft = { ...toDraft(base), municipalPerCapita: '3900.5' };
    expect(validateDraft(draft).municipalCapita).toBe('0以上の整数(円)を入力してください');
    expect(draftToConfig(draft, base)).toBeNull();
  });

  it('都道府県・市区町村の前後の空白は取り除かれる', () => {
    const base = yokohamaMunicipality();
    const config = draftToConfig({ ...toDraft(base), cityName: '  川崎市  ', prefectureName: ' 神奈川県 ' }, base)!;
    expect(config.name).toBe('川崎市');
    expect(config.prefectureName).toBe('神奈川県');
  });
});

describe('MunicipalityForm の描画', () => {
  afterEach(cleanup);

  it('入力するとonChangeへ更新後の下書きが渡る', async () => {
    const base = yokohamaMunicipality();
    const onChange = vi.fn();
    render(<MunicipalityForm draft={toDraft(base)} onChange={onChange} errors={validateDraft(toDraft(base))} forestTax={base.forestTax} />);

    await userEvent.type(screen.getByLabelText('市区町村'), 'X');

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ cityName: '横浜市X' }));
  });

  it('detailsOpenを指定すると超過課税の詳細設定が開いた状態で描画される', () => {
    const base = yokohamaMunicipality();
    const { rerender } = render(
      <MunicipalityForm draft={toDraft(base)} onChange={vi.fn()} errors={validateDraft(toDraft(base))} forestTax={base.forestTax} />
    );
    expect(screen.getByText(/詳細設定/).closest('details')).not.toHaveAttribute('open');

    rerender(
      <MunicipalityForm draft={toDraft(base)} onChange={vi.fn()} errors={validateDraft(toDraft(base))} detailsOpen forestTax={base.forestTax} />
    );
    expect(screen.getByText(/詳細設定/).closest('details')).toHaveAttribute('open');
  });

  it('エラーがある項目にはaria-invalidとメッセージが付く', () => {
    const base = yokohamaMunicipality();
    const draft = { ...toDraft(base), municipalRatePct: '' };
    render(<MunicipalityForm draft={draft} onChange={vi.fn()} errors={validateDraft(draft)} detailsOpen forestTax={base.forestTax} />);

    expect(screen.getByLabelText('所得割率(市町村) %')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('0以上の数値を入力してください');
  });
});
