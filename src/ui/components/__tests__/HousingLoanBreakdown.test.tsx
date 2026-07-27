// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { HousingLoanBreakdown } from '../HousingLoanBreakdown';
import type { CalculationResult, Yen } from '../../../domain/types';

afterEach(cleanup);

function housingLoan(overrides: Partial<CalculationResult['housingLoan']> = {}): CalculationResult['housingLoan'] {
  return {
    creditAvailable: 224_000 as Yen,
    usedInIncomeTax: 86_500 as Yen,
    carriedToResidentTax: 137_500 as Yen,
    residentTaxCap: 97_500 as Yen,
    wasted: 40_000 as Yen,
    ...overrides,
  };
}

const capDetail5pct = { ratioBased: 117_600, fixed: 97_500, ratio: 0.05 };

describe('HousingLoanBreakdown(Issue #8完了条件: 切り捨て損失の金額可視化)', () => {
  it('控除可能額が0円の場合はバーを出さず案内文のみ表示する', () => {
    render(
      <HousingLoanBreakdown
        housingLoan={housingLoan({ creditAvailable: 0 as Yen, usedInIncomeTax: 0 as Yen, carriedToResidentTax: 0 as Yen, wasted: 0 as Yen })}
        capDetail={{ ratioBased: 0, fixed: 0, ratio: 0 }}
      />
    );
    expect(screen.getByText(/控除可能額が0円のため可視化はありません/)).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('所得税から控除・住民税から控除・切り捨ての各金額が表示される', () => {
    const { container } = render(<HousingLoanBreakdown housingLoan={housingLoan()} capDetail={capDetail5pct} />);

    expect(screen.getByText('控除可能額:')).toBeInTheDocument();
    expect(container.textContent).toContain('224,000円');
    expect(container.textContent).toContain('86,500円');
    // 住民税から控除 = carriedToResidentTax(137,500) - wasted(40,000) = 97,500
    expect(container.textContent).toContain('97,500円');
    expect(container.textContent).toContain('40,000円');
  });

  it('切り捨てが発生している場合は警告アイコンが表示される', () => {
    render(<HousingLoanBreakdown housingLoan={housingLoan()} capDetail={capDetail5pct} />);
    expect(screen.getByText('⚠')).toBeInTheDocument();
  });

  it('切り捨てが0円の場合は警告アイコンを表示しない', () => {
    render(
      <HousingLoanBreakdown housingLoan={housingLoan({ carriedToResidentTax: 97_500 as Yen, wasted: 0 as Yen })} capDetail={capDetail5pct} />
    );
    expect(screen.queryByText('⚠')).not.toBeInTheDocument();
  });

  it('積み上げ棒にaria-labelで内訳が読み上げられる', () => {
    render(<HousingLoanBreakdown housingLoan={housingLoan()} capDetail={capDetail5pct} />);
    expect(screen.getByRole('img')).toHaveAccessibleName(/所得税から控除86,500円、住民税から控除97,500円、切り捨て40,000円/);
  });

  it('ratioに応じて上限内訳の比率表示が変わる(rule7pct136500は7%と表示、レビュー指摘#2是正)', () => {
    const { container } = render(<HousingLoanBreakdown housingLoan={housingLoan()} capDetail={{ ratioBased: 210_000, fixed: 136_500, ratio: 0.07 }} />);
    expect(container.textContent).toContain('課税総所得×7%');
    expect(container.textContent).not.toContain('課税総所得×5%');
  });

  it('「適用」表示はcapDetailの再計算値でなくhousingLoan.residentTaxCap(engineがincomeNonTaxableを反映した後の実際の値)を使う(レビュー指摘#3是正)', () => {
    // 住民税所得割が非課税限度額以下のケースを想定: engine.tsはこの場合residentTaxCapを強制的に0にするが、
    // 画面側で独立計算するcapDetail(ratioBased/fixed)はその非課税判定を知らないため非ゼロのままになりうる。
    // 「適用」表示はhousingLoan.residentTaxCap(0円)と一致すべきで、capDetailの再計算値(1,000円)と矛盾してはならない。
    const { container } = render(
      <HousingLoanBreakdown
        housingLoan={housingLoan({ carriedToResidentTax: 224_000 as Yen, residentTaxCap: 0 as Yen, wasted: 224_000 as Yen })}
        capDetail={{ ratioBased: 1_000, fixed: 97_500, ratio: 0.05 }}
      />
    );
    expect(container.textContent).toContain('→ 適用 0円');
    expect(container.textContent).not.toContain('→ 適用 1,000円');
  });
});
