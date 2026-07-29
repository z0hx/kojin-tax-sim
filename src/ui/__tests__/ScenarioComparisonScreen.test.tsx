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

/** 2025年分(給与600万円)と2026年分(収入0円、育休相当)に各30,000円の寄附予定を持つ人物を作る */
async function setupTwoYearProfiles() {
  useAppStore.getState().addPerson('本人', '#111111');
  await useAppStore.getState().createBlankYear(2025);
  useAppStore.getState().updateIncome({ otherSalaryIncome: 6_000_000 });
  useAppStore.getState().recordDonation({ municipalityName: '横浜市', amount: 30_000, date: '2025-06-01' });
  await flushNow();
  await useAppStore.getState().createBlankYear(2026);
  useAppStore.getState().recordDonation({ municipalityName: '横浜市', amount: 30_000, date: '2026-06-01' });
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

  describe('複数年配分の最適化(Issue #18完了条件: 2年分の配分シミュレーション結果が比較表示される)', () => {
    /** 配分対象は「現在の暦年以降」で決まるため、実時刻に依存しないようDateのみを固定する
     *  (setTimeoutまで固定するとfake-indexeddbやuserEventが解決しなくなるためtoFakeを絞る)。 */
    function freezeYear(year: number): void {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(`${year}-06-01T00:00:00+09:00`));
    }

    afterEach(() => {
      vi.useRealTimers();
    });

    it('年度データが1年分しかない場合は案内メッセージを表示する', async () => {
      await setupProfile(); // 2026年分のみ
      freezeYear(2026);
      await renderAppAndWaitLoaded();
      const main = await openScenarioComparisonScreen();

      expect(within(main).getByText(/2年分以上必要です/)).toBeInTheDocument();
    });

    it('2年分の年度データがある場合、上限額の大きい年へ寄附予定額が優先配分される', async () => {
      installStoragePersistMock();
      await setupTwoYearProfiles();
      freezeYear(2025); // 2025年分・2026年分がいずれも「これから寄附できる年」となる時点

      await renderAppAndWaitLoaded();
      const main = await openScenarioComparisonScreen();

      await waitFor(() => expect(within(main).getByText('2025年分')).toBeInTheDocument());
      expect(within(main).getByText('2026年分')).toBeInTheDocument();

      const row2025 = within(main).getByText('2025年分').closest('tr')!;
      const row2026 = within(main).getByText('2026年分').closest('tr')!;
      const limit2025 = Number(within(row2025).getAllByText(/円$/)[0].textContent!.replace(/[^\d]/g, ''));
      const limit2026 = Number(within(row2026).getAllByText(/円$/)[0].textContent!.replace(/[^\d]/g, ''));
      const suggested2025 = Number(within(row2025).getAllByText(/円$/)[2].textContent!.replace(/[^\d]/g, ''));
      const suggested2026 = Number(within(row2026).getAllByText(/円$/)[2].textContent!.replace(/[^\d]/g, ''));

      expect(limit2025).toBeGreaterThan(limit2026);
      expect(limit2026).toBe(0); // 収入0円の年は上限額も0円
      // 寄附予定額の合計(60,000円)は変えず、上限額の大きい2025年分へ全額を寄せる
      expect(suggested2025).toBe(60_000);
      expect(suggested2026).toBe(0);
      expect(within(main).getByText(/上限額が最も大きい2025年分/)).toBeInTheDocument();
      expect(within(main).queryByText(/配分の対象外としています/)).not.toBeInTheDocument();
    });

    it('過去年度は配分の対象外になり、対象が2年分に満たなければ案内メッセージへフォールバックする(#40)', async () => {
      installStoragePersistMock();
      await setupTwoYearProfiles();
      freezeYear(2026); // 2025年分は寄附の受付が終了している時点

      await renderAppAndWaitLoaded();
      const main = await openScenarioComparisonScreen();

      expect(within(main).getByText('2025年分は寄附の受付が終了しているため、配分の対象外としています。')).toBeInTheDocument();
      // 上限額が最大なのは2025年分だが、過去年度への配分は提案しない
      expect(within(main).queryByText(/上限額が最も大きい2025年分/)).not.toBeInTheDocument();
      expect(within(main).getByText(/2026年分以降の年度が2年分以上必要です/)).toBeInTheDocument();
    });
  });
});
