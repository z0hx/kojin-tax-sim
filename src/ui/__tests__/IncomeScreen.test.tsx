// @vitest-environment jsdom
/**
 * S-02 収入入力画面の統合テスト。App.test.tsx/DataManagement.test.txと同様、実際のZustandストア
 * (シングルトン)・IndexedDB(fake-indexeddb)を通して検証する。
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

async function openIncomeScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '収入入力' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  return screen.getByRole('heading', { name: /収入入力/ }).closest('main') as HTMLElement;
}

describe('IncomeScreen(S-02)', () => {
  it('人物の初年度データが無い場合はブートストラップ導線が表示され、作成するとrequestPersistenceが呼ばれる(Issue #6申し送り対応)', async () => {
    const { persist } = installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openIncomeScreen();

    expect(within(main).getByText('この人物にはまだ年度データがありません。年度を作成してください。')).toBeInTheDocument();
    const yearInput = within(main).getByLabelText('年度');
    await userEvent.clear(yearInput);
    await userEvent.type(yearInput, '2026');
    await userEvent.click(within(main).getByRole('button', { name: '年度データを作成' }));

    await waitFor(() => expect(within(main).getByText('月次収入・社会保険料')).toBeInTheDocument());
    expect(useAppStore.getState().activeYear).toBe(2026);
    await waitFor(() => expect(persist).toHaveBeenCalled());
  });

  it('月次グリッドへの入力がstoreのincome.monthlyへ反映される', async () => {
    installStoragePersistMock();
    const personId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openIncomeScreen();

    const janInput = within(main).getByLabelText('1月の給与');
    await userEvent.clear(janInput);
    await userEvent.type(janInput, '4');

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons.find((p) => p.id === personId)!.years[2026]!;
      expect(profile.income.monthly.find((m) => m.month === 1)?.grossSalary).toBe(4);
    });
  });

  it('育休期間を追加すると対象月がグリッド上でdisabled・0円表示になり、非課税給付合計に反映される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openIncomeScreen();

    await userEvent.selectOptions(within(main).getByLabelText('開始月'), '1');
    await userEvent.selectOptions(within(main).getByLabelText('終了月'), '2');
    const benefitInput = within(main).getByLabelText('給付金額(円)');
    await userEvent.clear(benefitInput);
    await userEvent.type(benefitInput, '200000');
    await userEvent.click(within(main).getByRole('button', { name: '追加' }));

    await waitFor(() => expect((within(main).getByLabelText('1月の給与') as HTMLInputElement).disabled).toBe(true));
    // 給付金額(育休期間一覧の1件)と非課税給付合計(サマリ表示)の2箇所に200,000円が出るはず
    expect(within(main).getAllByText('200,000円').length).toBeGreaterThanOrEqual(2);
  });

  it('「見込み月を直近実績月で埋める」は育休対象月を上書きしない(M-1対応)', async () => {
    installStoragePersistMock();
    const personId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    // 1月を育休(対象月)、2月を実績40万円に設定してから見込み埋めを行う
    useAppStore.getState().updateIncome({
      leavePeriods: [{ type: 'childcare', startYm: '2026-01', endYm: '2026-01', benefitAmount: 0 }],
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: i === 1 ? ('actual' as const) : ('estimated' as const),
        grossSalary: i === 1 ? 400_000 : 0,
        socialInsurance: i === 1 ? 60_000 : 0,
        isSocialInsuranceExempt: false,
      })),
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openIncomeScreen();

    await userEvent.click(within(main).getByRole('button', { name: '見込み月を直近実績月で埋める' }));

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons.find((p) => p.id === personId)!.years[2026]!;
      const jan = profile.income.monthly.find((m) => m.month === 1)!;
      const mar = profile.income.monthly.find((m) => m.month === 3)!;
      // 1月(育休対象)は生データのまま(0円)で上書きされない
      expect(jan.grossSalary).toBe(0);
      // 3月(育休対象外)は直近実績(2月=40万円)で埋まる
      expect(mar.grossSalary).toBe(400_000);
    });
  });

  it('社会保険料を内訳入力に切り替えて入力すると、その合計が社会保険料控除に反映される(Issue #48)', async () => {
    installStoragePersistMock();
    const personId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    // 1月のみ給与を入力しておき、社会保険料控除の額を内訳だけで動かせる状態にする
    useAppStore.getState().updateIncome({
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: 'actual' as const,
        grossSalary: i === 0 ? 400_000 : 0,
        socialInsurance: 0,
        isSocialInsuranceExempt: false,
      })),
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openIncomeScreen();

    await userEvent.selectOptions(within(main).getByLabelText('1月の社会保険料の入力方法'), 'breakdown');
    for (const [label, amount] of [
      ['1月の健康保険料', '20000'],
      ['1月の厚生年金保険料', '36000'],
      ['1月の雇用保険料', '2000'],
    ] as const) {
      const input = await waitFor(() => within(main).getByLabelText(label));
      await userEvent.clear(input);
      await userEvent.type(input, amount);
    }

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons.find((p) => p.id === personId)!.years[2026]!;
      const jan = profile.income.monthly.find((m) => m.month === 1)!;
      expect(jan.socialInsuranceInputMode).toBe('breakdown');
      expect(jan.socialInsuranceBreakdown).toEqual({ healthInsurance: 20_000, nursingCare: 0, pension: 36_000, employmentInsurance: 2_000, other: 0 });
    });
    await waitFor(() => {
      expect(useAppStore.getState().calculationResult!.incomeTax.deductions.socialInsurance).toBe(58_000);
    });
  });
});
