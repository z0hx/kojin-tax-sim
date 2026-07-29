// @vitest-environment jsdom
/**
 * S-11 世帯ビュー画面の統合テスト。他画面のテストと同様、実際のZustandストア(シングルトン)・
 * IndexedDB(fake-indexeddb)を通して検証する。Issue #14完了条件:
 * 複数人物の上限額等が一覧表示され、世帯計が表示される。配偶者控除への連携ボタンが機能する。
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

async function openHouseholdViewScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '世帯ビュー' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /世帯ビュー/ })).toBeInTheDocument());
  return screen.getByRole('heading', { name: /世帯ビュー/ }).closest('main') as HTMLElement;
}

async function addPersonWithIncome(name: string, color: string, monthlySalary: number) {
  const id = useAppStore.getState().addPerson(name, color);
  await useAppStore.getState().setActivePerson(id);
  await useAppStore.getState().createBlankYear(2026);
  useAppStore.getState().updateIncome({
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      status: 'actual' as const,
      grossSalary: monthlySalary,
      socialInsurance: Math.round(monthlySalary * 0.14),
      isSocialInsuranceExempt: false,
    })),
  });
  await flushNow();
  return id;
}

describe('HouseholdViewScreen(S-11・Issue #14)', () => {
  it('複数人物の上限額等が一覧表示され、世帯計が両者の合計と一致する', async () => {
    installStoragePersistMock();
    await renderAppAndWaitLoaded();

    await addPersonWithIncome('本人', '#111111', 500_000);
    const selfLimit = useAppStore.getState().calculationResult!.furusato.limitAmount;
    const selfRecommended = useAppStore.getState().calculationResult!.furusato.recommendedAmount;
    await addPersonWithIncome('配偶者', '#222222', 300_000);
    const spouseLimit = useAppStore.getState().calculationResult!.furusato.limitAmount;
    const spouseRecommended = useAppStore.getState().calculationResult!.furusato.recommendedAmount;

    const main = await openHouseholdViewScreen();
    const selfRow = within(main).getByText('本人').closest('tr') as HTMLElement;
    const spouseRow = within(main).getByText('配偶者').closest('tr') as HTMLElement;
    const selfCells = within(selfRow).getAllByRole('cell');
    const spouseCells = within(spouseRow).getAllByRole('cell');
    expect(selfCells[1].textContent).toBe(`${selfLimit.toLocaleString()}円`);
    expect(selfCells[2].textContent).toBe(`${selfRecommended.toLocaleString()}円`);
    expect(spouseCells[1].textContent).toBe(`${spouseLimit.toLocaleString()}円`);
    expect(spouseCells[2].textContent).toBe(`${spouseRecommended.toLocaleString()}円`);

    const totalRow = within(main).getByText('世帯計').closest('tr') as HTMLElement;
    const totalCells = within(totalRow).getAllByRole('cell');
    expect(totalCells[1].textContent).toBe(`${(selfLimit + spouseLimit).toLocaleString()}円`);
    expect(totalCells[2].textContent).toBe(`${(selfRecommended + spouseRecommended).toLocaleString()}円`);

    const rows = within(main).getAllByRole('row');
    // ヘッダー行 + 本人行 + 配偶者行 + 世帯計行
    expect(rows.length).toBe(4);
  });

  it('データの無い人物を含む場合、世帯計はデータのある人物のみ合算する', async () => {
    installStoragePersistMock();
    await renderAppAndWaitLoaded();

    await addPersonWithIncome('本人', '#111111', 500_000);
    const selfLimit = useAppStore.getState().calculationResult!.furusato.limitAmount;
    const selfRecommended = useAppStore.getState().calculationResult!.furusato.recommendedAmount;
    useAppStore.getState().addPerson('データ無し', '#333333');
    await flushNow();

    const main = await openHouseholdViewScreen();
    const noDataRow = within(main).getByText('データ無し').closest('tr') as HTMLElement;
    expect(within(noDataRow).getByText('データなし')).toBeInTheDocument();

    const totalRow = within(main).getByText('世帯計').closest('tr') as HTMLElement;
    const totalCells = within(totalRow).getAllByRole('cell');
    expect(totalCells[1].textContent).toBe(`${selfLimit.toLocaleString()}円`);
    expect(totalCells[2].textContent).toBe(`${selfRecommended.toLocaleString()}円`);
  });

  it('データの無い人物は「データなし」と表示される', async () => {
    installStoragePersistMock();
    await renderAppAndWaitLoaded();

    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    const main = await openHouseholdViewScreen();
    expect(within(main).getByText('データなし')).toBeInTheDocument();
  });

  it('配偶者控除に連携ボタンで配偶者の合計所得金額がアクティブな人物へコピーされる', async () => {
    installStoragePersistMock();
    await renderAppAndWaitLoaded();

    await addPersonWithIncome('本人', '#111111', 500_000);
    const spouseId = await addPersonWithIncome('配偶者', '#222222', 300_000);
    const spouseTotalIncome = useAppStore.getState().calculationResult!.income.totalIncome;

    // アクティブな人物を本人に戻す(addPersonWithIncomeが配偶者に切り替えているため)
    const selfId = useAppStore
      .getState()
      .appData!.persons.find((p) => p.displayName === '本人')!.id;
    await useAppStore.getState().setActivePerson(selfId);

    const main = await openHouseholdViewScreen();
    const spouseRow = within(main).getByText('配偶者').closest('tr') as HTMLElement;
    await userEvent.click(within(spouseRow).getByRole('button', { name: '配偶者控除に連携' }));

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons.find((p) => p.id === selfId)!.years[2026]!;
      expect(profile.deductions.spouse?.totalIncome).toBe(spouseTotalIncome);
    });

    void spouseId;
  });

  it('配偶者にアクティブ年度のデータが無い場合、連携ボタンを押すとエラーが表示される(年度またぎ)', async () => {
    installStoragePersistMock();
    await renderAppAndWaitLoaded();

    const selfId = await addPersonWithIncome('本人', '#111111', 500_000);
    // 配偶者は2025年分のみ持ち、2026年分は未作成(resolveYearProfileのフォールバックでavailable:trueにはなる)
    const spouseId = useAppStore.getState().addPerson('配偶者', '#222222');
    await useAppStore.getState().createBlankYear(2025);
    useAppStore.getState().updateIncome({ otherSalaryIncome: 3_000_000 });
    await flushNow();
    await useAppStore.getState().setActivePerson(selfId);

    const main = await openHouseholdViewScreen();
    const spouseRow = within(main).getByText('配偶者').closest('tr') as HTMLElement;
    await userEvent.click(within(spouseRow).getByRole('button', { name: '配偶者控除に連携' }));

    await waitFor(() => {
      expect(within(main).getByRole('alert')).toHaveTextContent('2026年分のデータが無い');
    });

    const profile = useAppStore.getState().appData!.persons.find((p) => p.id === selfId)!.years[2026]!;
    expect(profile.deductions.spouse?.totalIncome).toBeUndefined();
    void spouseId;
  });

  it('アクティブな人物自身の行には連携ボタンが表示されない', async () => {
    installStoragePersistMock();
    await renderAppAndWaitLoaded();

    await addPersonWithIncome('本人', '#111111', 500_000);

    const main = await openHouseholdViewScreen();
    const selfRow = within(main).getByText('本人').closest('tr') as HTMLElement;
    expect(within(selfRow).queryByRole('button', { name: '配偶者控除に連携' })).not.toBeInTheDocument();
  });
});
