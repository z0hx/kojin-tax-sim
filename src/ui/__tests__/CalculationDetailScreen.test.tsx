// @vitest-environment jsdom
/**
 * S-05 計算明細画面の統合テスト。他画面のテストと同様、実際のZustandストア(シングルトン)・
 * IndexedDB(fake-indexeddb)を通して検証する。Issue #10完了条件:
 * (1) 「なぜこの上限になったか」を各計算ステップから追跡できる (2) 金額表示で桁がずれない
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import App from '../../App';
import { useAppStore, initialState } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { clearAppData } from '../../persistence/repository';
import { flushNow, resetSaveQueueForTests } from '../../store/saveQueue';
import {
  installMemoryLocalStorage,
  installStoragePersistMock,
  stubFetchForTaxParams,
  uninstallMemoryLocalStorage,
  uninstallStoragePersistMock,
} from '../../store/__tests__/testUtils';

beforeEach(async () => {
  await clearAppData();
  resetSaveQueueForTests();
  installMemoryLocalStorage();
  stubFetchForTaxParams();
  useAppStore.setState(initialState());
  useNavigation.setState({ screen: 'main' });
});

afterEach(() => {
  cleanup();
  uninstallMemoryLocalStorage();
  uninstallStoragePersistMock();
  vi.unstubAllGlobals();
  resetSaveQueueForTests();
});

async function renderAppAndWaitLoaded() {
  render(<App />);
  await waitFor(() => expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument());
}

async function openCalculationDetailScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '計算明細' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /計算明細/ })).toBeInTheDocument());
  return screen.getByRole('heading', { name: /計算明細/ }).closest('main') as HTMLElement;
}

describe('CalculationDetailScreen(S-05)', () => {
  it('人物の年度データが無い場合は収入入力画面への案内が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    expect(within(main).getByText('この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。')).toBeInTheDocument();
    await userEvent.click(within(main).getByRole('button', { name: '収入入力へ' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  });

  it('計算過程の各ステップが項目名・金額・計算式・根拠とともに表示される(完了条件: 上限になった理由を追跡できる)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: 'actual' as const,
        grossSalary: 500_000,
        socialInsurance: 70_000,
        isSocialInsuranceExempt: false,
      })),
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    const result = useAppStore.getState().calculationResult!;
    expect(result.trace.length).toBeGreaterThan(0);

    // 代表的なステップ(給与所得控除)が項目名・金額・計算式・根拠のすべてを伴って表示される
    const row = within(main).getByText('給与所得控除').closest('tr')!;
    expect(within(row).getByText(/円$/)).toBeInTheDocument();
    expect(within(row).getByText(/最低保障額/)).toBeInTheDocument();
    expect(within(row).getByText(/02仕様書§3\.2\.1/)).toBeInTheDocument();
  });

  it('限界税率はパーセント表示、非課税限度額の適用可否は「適用/非適用」で表示される(金額以外の値の表示形式)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: 'actual' as const,
        grossSalary: 500_000,
        socialInsurance: 70_000,
        isSocialInsuranceExempt: false,
      })),
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    const rateRow = within(main).getByText('限界税率').closest('tr')!;
    expect(within(rateRow).getByText(/%$/)).toBeInTheDocument();

    const nonTaxableRow = within(main).getByText('住民税(所得割)非課税限度額の適用').closest('tr')!;
    expect(within(nonTaxableRow).getByText(/^(適用|非適用)$/)).toBeInTheDocument();
  });

  it('標準/保守的モードの上限額・推奨額が並記され、差額が表示される(02仕様書§4.3)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: 'actual' as const,
        grossSalary: 500_000,
        socialInsurance: 70_000,
        isSocialInsuranceExempt: false,
      })),
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    expect(within(main).getByText(/^標準\(20%枠の基準/)).toBeInTheDocument();
    expect(within(main).getByText(/保守的/)).toBeInTheDocument();
    expect(within(main).getByText(/差額\(解釈による振れ幅\)/)).toBeInTheDocument();

    const result = useAppStore.getState().calculationResult!;
    // 標準・保守的の上限額が一致するケース(住宅ローン控除が無い)では差額は0円
    expect(result.furusato.limitAmount).toBe(result.furusatoConservative.limitAmount);
    const diffParagraph = within(main).getByText(/差額\(解釈による振れ幅\)/).closest('p')!;
    expect(within(diffParagraph).getByText('0円')).toBeInTheDocument();
  });

  it('標準/保守的モードの上限額が実際に異なるケースで、差額が正しい符号・金額で表示される(実装後レビュー対応: モード比較の非ゼロ差分が未検証だった)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({ otherSalaryIncome: 6_000_000 });
    useAppStore.getState().updateHousingLoan({
      moveInYear: 2023,
      years: 13,
      rate: 0.007,
      yearEndBalance: 35_000_000,
      borrowingCap: 50_000_000,
      residentTaxCapRule: 'rule5pct97500',
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    const result = useAppStore.getState().calculationResult!;
    // 保守的モードは住宅ローン控除適用後の所得割額を20%枠の基準にするため、標準以下になる
    expect(result.furusatoConservative.limitAmount).toBeLessThan(result.furusato.limitAmount);
    const expectedDiff = result.furusato.limitAmount - result.furusatoConservative.limitAmount;
    expect(expectedDiff).toBeGreaterThan(0);

    const diffParagraph = within(main).getByText(/差額\(解釈による振れ幅\)/).closest('p')!;
    expect(within(diffParagraph).getByText(`${expectedDiff.toLocaleString()}円`)).toBeInTheDocument();
  });

  it('金額セルには等幅数字クラス(.amount)が適用され、桁がずれないようになっている', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: 'actual' as const,
        grossSalary: 500_000,
        socialInsurance: 70_000,
        isSocialInsuranceExempt: false,
      })),
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    const row = within(main).getByText('給与収入合計').closest('tr')!;
    const amountCell = within(row).getByText(/円$/);
    expect(amountCell).toHaveClass('amount');
  });

  it('印刷ボタンでwindow.print()が呼ばれる(FR-20完了条件)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    const printSpy = vi.fn();
    vi.stubGlobal('print', printSpy);

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    await userEvent.click(within(main).getByRole('button', { name: '印刷' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('印刷対象外の要素(戻るボタン・印刷ボタン自体)にno-printクラスが付与される(FR-20完了条件)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    expect(within(main).getByRole('button', { name: '← 戻る' })).toHaveClass('no-print');
    expect(within(main).getByRole('button', { name: '印刷' })).toHaveClass('no-print');
  });

  it('税制パラメータの最終確認日と出典が常時表示される(R-10)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openCalculationDetailScreen();

    const params = useAppStore.getState().taxParams[2026];
    expect(within(main).getByRole('heading', { name: /税制パラメータの出所/ })).toBeInTheDocument();
    expect(within(main).getByText(params.meta.verifiedAt)).toBeInTheDocument();
    for (const source of params.meta.sources) {
      expect(within(main).getByText(source)).toBeInTheDocument();
    }
  });
});
