// @vitest-environment jsdom
/**
 * S-07 シナリオ比較画面の統合テスト。他画面のテストと同様、実際のZustandストア(シングルトン)・
 * IndexedDB(fake-indexeddb)を通して検証する。Issue #13完了条件:
 * 複数シナリオの上限額・自己負担等が表形式で並列比較できる。
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
import { runScenario } from '../../domain/scenario';
import type { Yen } from '../../domain/types';

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

async function openScenarioComparisonScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'シナリオ比較' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /シナリオ比較/ })).toBeInTheDocument());
  return screen.getByRole('heading', { name: /シナリオ比較/ }).closest('main') as HTMLElement;
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

describe('ScenarioComparisonScreen(S-07)', () => {
  it('人物の年度データが無い場合は収入入力画面への案内が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openScenarioComparisonScreen();

    expect(within(main).getByText('この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。')).toBeInTheDocument();
    await userEvent.click(within(main).getByRole('button', { name: '収入入力へ' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  });

  it('未追加の状態では基準行のみが表示される', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openScenarioComparisonScreen();

    expect(within(main).getByText('基準(現在の入力)')).toBeInTheDocument();
    const table = within(main).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2); // ヘッダ行+基準行
  });

  it('シナリオ名を空欄のまま追加しようとするとエラーになり、行は増えない', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openScenarioComparisonScreen();

    await userEvent.click(within(main).getByRole('button', { name: '追加' }));
    expect(within(main).getByRole('alert')).toHaveTextContent('シナリオ名は必須です');
    const table = within(main).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(2);
  });

  it('シナリオ名を入力済みで復職月が範囲外の場合、シナリオ名ではなく復職月に関するエラーが表示される(実装後レビュー対応: 誤ったエラー原因の表示防止)', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openScenarioComparisonScreen();

    await userEvent.type(within(main).getByLabelText('シナリオ名'), 'テストシナリオ');
    await userEvent.type(within(main).getByLabelText('復職月'), '13');
    await userEvent.click(within(main).getByRole('button', { name: '追加' }));

    const alert = within(main).getByRole('alert');
    expect(alert).toHaveTextContent('復職月は1〜12の整数で入力してください');
    expect(alert).not.toHaveTextContent('シナリオ名は必須です');
  });

  it('追加医療費を増やすシナリオを追加すると、domain/scenario.tsの計算結果と一致する行が表示される', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openScenarioComparisonScreen();

    await userEvent.type(within(main).getByLabelText('シナリオ名'), '医療費増加');
    await userEvent.type(within(main).getByLabelText('追加医療費'), '300000');
    await userEvent.click(within(main).getByRole('button', { name: '追加' }));

    await waitFor(() => expect(within(main).getByText('医療費増加')).toBeInTheDocument());
    const table = within(main).getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(3); // ヘッダ+基準+追加した1件

    // 表示された上限額が、domain/scenario.tsを直接呼んだ場合の計算結果と一致すること(UIが独自にロジックを
    // 再実装していないことの確認)。ハードコードした期待値を使わず、実装の同じ関数を通して比較する。
    const profile = useAppStore.getState().appData!.persons[0].years[2026]!;
    const params = useAppStore.getState().taxParams[2026]!;
    const expected = runScenario(profile, { label: '医療費増加', additionalMedicalExpense: 300_000 as Yen }, params);
    const scenarioRow = within(main).getByText('医療費増加').closest('tr')!;
    expect(within(scenarioRow).getAllByText(/円$/)[0]).toHaveTextContent(`${expected.furusato.limitAmount.toLocaleString()}円`);
  });

  it('賞与倍率を0にするシナリオを追加すると、上限額が基準以下になる', async () => {
    await setupProfile();
    useAppStore.getState().updateIncome({
      bonuses: [{ label: '夏季賞与', month: 6, status: 'estimated', gross: 500_000, socialInsurance: 70_000, isExempt: false }],
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openScenarioComparisonScreen();

    const baseLimitText = within(main).getByText('基準(現在の入力)').closest('tr')!.querySelector('.amount')!.textContent!;
    const baseLimit = Number(baseLimitText.replace(/[^\d]/g, ''));

    await userEvent.type(within(main).getByLabelText('シナリオ名'), '賞与ゼロ');
    await userEvent.type(within(main).getByLabelText('賞与倍率'), '0');
    await userEvent.click(within(main).getByRole('button', { name: '追加' }));

    await waitFor(() => expect(within(main).getByText('賞与ゼロ')).toBeInTheDocument());
    const scenarioRow = within(main).getByText('賞与ゼロ').closest('tr')!;
    const scenarioLimitText = within(scenarioRow).getAllByText(/円$/)[0].textContent!;
    const scenarioLimit = Number(scenarioLimitText.replace(/[^\d]/g, ''));
    expect(scenarioLimit).toBeLessThanOrEqual(baseLimit);
  });

  it('シナリオを削除すると比較表から行が消える', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openScenarioComparisonScreen();

    await userEvent.type(within(main).getByLabelText('シナリオ名'), '削除対象');
    await userEvent.click(within(main).getByRole('button', { name: '追加' }));
    await waitFor(() => expect(within(main).getByText('削除対象')).toBeInTheDocument());

    await userEvent.click(within(main).getByRole('button', { name: '削除' }));
    expect(within(main).queryByText('削除対象')).not.toBeInTheDocument();
  });

  it('主計算結果(store.calculationResult)にはシナリオ追加が影響しない(比較はローカルstateのみ)', async () => {
    await setupProfile();
    await renderAppAndWaitLoaded();
    const main = await openScenarioComparisonScreen();

    const before = useAppStore.getState().calculationResult!.furusato.limitAmount;
    const beforeDonated = useAppStore.getState().appData!.persons[0].years[2026]!.furusato.donatedAmount;

    await userEvent.type(within(main).getByLabelText('シナリオ名'), '寄附額変更');
    await userEvent.type(within(main).getByLabelText('寄附額(見込み)'), '50000');
    await userEvent.click(within(main).getByRole('button', { name: '追加' }));

    await waitFor(() => expect(within(main).getByText('寄附額変更')).toBeInTheDocument());
    expect(useAppStore.getState().calculationResult!.furusato.limitAmount).toBe(before);
    expect(useAppStore.getState().appData!.persons[0].years[2026]!.furusato.donatedAmount).toBe(beforeDonated);
  });
});
