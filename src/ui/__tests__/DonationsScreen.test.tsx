// @vitest-environment jsdom
/**
 * 寄附実績記録画面(FR-21、Issue #17)の統合テスト。完了条件:
 * (1) 寄附実績を追加すると残枠表示が更新される (2) ワンストップ特例の要否・締切がリスト表示される
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

async function openDonationsScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '寄附実績' }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /寄附実績/ })).toBeInTheDocument());
  return screen.getByRole('heading', { level: 1, name: /寄附実績/ }).closest('main') as HTMLElement;
}

/** ラベルと金額がspan分割されており通常のgetByTextでは一致しない行を、要素のtextContent全体で照合する */
function byFullText(text: string) {
  return (_: string, element: Element | null) => element?.textContent === text;
}

async function addDonation(main: HTMLElement, name: string, amount: string, date: string) {
  await userEvent.clear(within(main).getByLabelText('自治体名'));
  await userEvent.type(within(main).getByLabelText('自治体名'), name);
  await userEvent.clear(within(main).getByLabelText('金額(円)'));
  await userEvent.type(within(main).getByLabelText('金額(円)'), amount);
  const dateInput = within(main).getByLabelText('寄附日') as HTMLInputElement;
  await userEvent.clear(dateInput);
  await userEvent.type(dateInput, date);
  await userEvent.click(within(main).getByRole('button', { name: '追加' }));
}

describe('DonationsScreen(S-08相当)', () => {
  it('人物の年度データが無い場合は収入入力画面への案内が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDonationsScreen();

    expect(within(main).getByText('この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。')).toBeInTheDocument();
    await userEvent.click(within(main).getByRole('button', { name: '収入入力へ' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  });

  it('寄附実績を追加すると一覧・寄附済み・残枠が更新される(完了条件)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({ otherSalaryIncome: 6_000_000 });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDonationsScreen();
    const limitAmount = useAppStore.getState().calculationResult!.furusato.limitAmount;

    expect(within(main).getByText('まだ寄附実績がありません。')).toBeInTheDocument();
    expect(within(main).getByText(byFullText(`残り ${limitAmount.toLocaleString()}円`))).toBeInTheDocument();

    await addDonation(main, '横浜市', '10000', '2026-06-01');

    await waitFor(() => expect(within(main).getByText('横浜市')).toBeInTheDocument());
    expect(within(main).getByText('2026-06-01')).toBeInTheDocument();
    expect(useAppStore.getState().appData!.persons[0].years[2026].furusato.donations[0].date).toBe('2026-06-01');
    expect(within(main).getByText(byFullText('寄附済み 10,000円'))).toBeInTheDocument();
    expect(within(main).getByText(byFullText(`残り ${(limitAmount - 10_000).toLocaleString()}円`))).toBeInTheDocument();
    expect(useAppStore.getState().appData!.persons[0].years[2026].furusato.donatedAmount).toBe(10_000);
  });

  it('寄附実績を削除すると寄附済み・残枠が再計算される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().recordDonation({ municipalityName: '横浜市', amount: 10_000, date: '2026-06-01' });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDonationsScreen();

    await userEvent.click(within(main).getByRole('button', { name: '削除' }));

    await waitFor(() => expect(within(main).getByText('まだ寄附実績がありません。')).toBeInTheDocument());
    expect(within(main).getByText(byFullText('寄附済み 0円'))).toBeInTheDocument();
  });

  it('自治体名が未入力の場合はエラーを表示し追加しない', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDonationsScreen();

    await userEvent.clear(within(main).getByLabelText('金額(円)'));
    await userEvent.type(within(main).getByLabelText('金額(円)'), '10000');
    await userEvent.click(within(main).getByRole('button', { name: '追加' }));

    expect(within(main).getByRole('alert')).toHaveTextContent('自治体名を入力してください');
    expect(within(main).getByText('まだ寄附実績がありません。')).toBeInTheDocument();
  });

  it('医療費控除が無く5自治体以内ならワンストップ特例が利用可能と表示され、締切(翌年1/10)が示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDonationsScreen();

    expect(within(main).getByText(/利用できます/)).toBeInTheDocument();
    expect(within(main).getByText('2027-01-10')).toBeInTheDocument();
  });

  it('医療費控除の入力がある場合はワンストップ特例が利用不可と表示される(FR-14と連動)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateDeductions({ medical: { paid: 150_000, reimbursed: 0, selfMedication: 0, mode: 'auto' } });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDonationsScreen();

    expect(within(main).getByText(/利用できません/)).toBeInTheDocument();
    expect(within(main).getByText(/確定申告が必要/)).toBeInTheDocument();
  });

  it('住宅ローン控除の初年度(入居年)はワンストップ特例が利用不可と表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateHousingLoan({
      moveInYear: 2026,
      years: 13,
      rate: 0.007,
      yearEndBalance: 30_000_000,
      borrowingCap: 40_000_000,
      residentTaxCapRule: 'rule5pct97500',
    });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDonationsScreen();

    expect(within(main).getByText(/利用できません/)).toBeInTheDocument();
    expect(within(main).getByText(/住宅ローン控除の初年度/)).toBeInTheDocument();
  });

  it('寄附先が6自治体以上になるとワンストップ特例が利用不可と表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    for (let i = 0; i < 6; i++) {
      useAppStore.getState().recordDonation({ municipalityName: `自治体${i}`, amount: 5_000, date: '2026-06-01' });
    }
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDonationsScreen();

    expect(within(main).getByText(/利用できません/)).toBeInTheDocument();
    expect(within(main).getByText(/6自治体/)).toBeInTheDocument();
  });
});
