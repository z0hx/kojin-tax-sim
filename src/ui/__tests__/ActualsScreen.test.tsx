// @vitest-environment jsdom
/**
 * 検算モード画面(FR-17、Issue #12)の統合テスト。他画面のテストと同様、実際のZustandストア
 * (シングルトン)・IndexedDB(fake-indexeddb)を通して検証する。
 *
 * ここで入力する金額はすべて説明用の架空の数値であり、実在の源泉徴収票・住民税決定通知書の値ではない
 * (実データはこのリポジトリにコミットしない方針。実データでの検証はユーザー自身がローカルで行う)。
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

async function openActualsScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '検算' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /検算/ })).toBeInTheDocument());
  return screen.getByRole('heading', { name: /検算/ }).closest('main') as HTMLElement;
}

async function setupProfile() {
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
}

describe('ActualsScreen(検算モード, Issue #12)', () => {
  it('人物の年度データが無い場合は収入入力画面への案内が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openActualsScreen();

    expect(within(main).getByText('この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。')).toBeInTheDocument();
    await userEvent.click(within(main).getByRole('button', { name: '収入入力へ' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  });

  it('未入力の状態では突合結果が表示されない', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openActualsScreen();

    expect(within(main).queryByText('突合結果')).not.toBeInTheDocument();
  });

  it('源泉徴収税額を入力すると計算値と突き合わされ、storeに反映される', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openActualsScreen();

    const result = useAppStore.getState().calculationResult!;
    const input = within(main).getByLabelText('源泉徴収税額');
    await userEvent.clear(input);
    await userEvent.type(input, String(result.incomeTax.total));

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons[0].years[2026]!;
      expect(profile.actuals?.incomeTaxTotal).toBe(result.incomeTax.total);
    });
    await waitFor(() => expect(within(main).getByText('突合結果')).toBeInTheDocument());
    expect(within(main).getByText('すべての項目が誤差±1%以内で一致しています。')).toBeInTheDocument();
  });

  it('誤差が1%を超える実績値を入力すると「要確認」の警告が表示される', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openActualsScreen();

    const result = useAppStore.getState().calculationResult!;
    const wrongValue = result.incomeTax.total + Math.max(10_000, Math.round(result.incomeTax.total * 0.1));
    const input = within(main).getByLabelText('源泉徴収税額');
    await userEvent.clear(input);
    await userEvent.type(input, String(wrongValue));

    await waitFor(() => expect(within(main).getByText(/誤差が±1%を超える項目があります/)).toBeInTheDocument());
    expect(within(main).getByText('要確認')).toBeInTheDocument();
  });

  it('入力済みの1項目だけを空欄に戻すと、その項目がactualsから消え突合結果の行も消える(実装後レビュー対応)', async () => {
    await setupProfile();
    useAppStore.getState().updateActuals({ source: 'withholding', incomeTaxTotal: 12_345, residentPerCapita: 5_000 });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openActualsScreen();

    await waitFor(() => expect(within(main).getByLabelText('源泉徴収税額')).toHaveValue('12345'));
    await userEvent.clear(within(main).getByLabelText('源泉徴収税額'));

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons[0].years[2026]!;
      expect(profile.actuals?.incomeTaxTotal).toBeUndefined();
      // 他のフィールド(residentPerCapita)はクリアされずに残っていること
      expect(profile.actuals?.residentPerCapita).toBe(5_000);
    });
    // 削除した項目の行(源泉徴収税額)は消え、残っている項目(住民税均等割額)の行だけが表示される
    const tableAfter = within(main).getByRole('table');
    await waitFor(() => expect(within(tableAfter).queryByText('源泉徴収税額(所得税+復興特別所得税)')).not.toBeInTheDocument());
    expect(within(tableAfter).getByText('住民税均等割額')).toBeInTheDocument();
  });

  it('「実績値の入力をすべて取り消す」でactualsがnullに戻る', async () => {
    await setupProfile();
    useAppStore.getState().updateActuals({ source: 'withholding', incomeTaxTotal: 12_345 });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openActualsScreen();

    await userEvent.click(within(main).getByRole('button', { name: '実績値の入力をすべて取り消す' }));

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons[0].years[2026]!;
      expect(profile.actuals).toBeUndefined();
    });
    expect(within(main).queryByText('突合結果')).not.toBeInTheDocument();
  });

  it('誤差が1%を超える実績値がある場合、ダッシュボードに検算未達バナーが表示される', async () => {
    await setupProfile();
    const result = useAppStore.getState().calculationResult!;
    const wrongValue = result.incomeTax.total + Math.max(10_000, Math.round(result.incomeTax.total * 0.1));
    useAppStore.getState().updateActuals({ source: 'withholding', incomeTaxTotal: wrongValue });
    await flushNow();

    await renderAppAndWaitLoaded();

    await waitFor(() => expect(screen.getByText(/検算.*実績値との突合.*で誤差±1%を超える項目があります/)).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: '検算画面で確認' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /検算/ })).toBeInTheDocument());
  });
});
