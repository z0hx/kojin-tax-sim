// @vitest-environment jsdom
/**
 * S-04 住宅ローン控除画面の統合テスト。DeductionsScreen.test.tsx/IncomeScreen.test.tsxと同様、
 * 実際のZustandストア(シングルトン)・IndexedDB(fake-indexeddb)を通して検証する。
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

async function openHousingLoanScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '住宅ローン控除' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /住宅ローン控除/ })).toBeInTheDocument());
  return screen.getByRole('heading', { name: /住宅ローン控除/ }).closest('main') as HTMLElement;
}

describe('HousingLoanScreen(S-04)', () => {
  it('人物の年度データが無い場合は収入入力画面への案内が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openHousingLoanScreen();

    expect(within(main).getByText('この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。')).toBeInTheDocument();
    await userEvent.click(within(main).getByRole('button', { name: '収入入力へ' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  });

  it('未入力の状態ではトグルのみが表示され、可視化欄は入力なしの案内になる', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openHousingLoanScreen();

    expect(within(main).getByRole('checkbox', { name: '住宅ローン控除の対象である' })).not.toBeChecked();
    expect(within(main).getByText(/住宅ローン控除の入力がないか、控除可能額が0円/)).toBeInTheDocument();
  });

  it('トグルをONにして年末残高等を入力すると、storeに反映され切り捨て額が可視化される', async () => {
    installStoragePersistMock();
    const personId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openHousingLoanScreen();

    await userEvent.click(within(main).getByRole('checkbox', { name: '住宅ローン控除の対象である' }));
    await waitFor(() => expect(within(main).getByLabelText('年末残高')).toBeInTheDocument());

    const balanceInput = within(main).getByLabelText('年末残高');
    await userEvent.clear(balanceInput);
    await userEvent.type(balanceInput, '32000000');
    const capInput = within(main).getByLabelText('借入限度額');
    await userEvent.clear(capInput);
    await userEvent.type(capInput, '40000000');

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons.find((p) => p.id === personId)!.years[2026]!;
      expect(profile.housingLoan?.yearEndBalance).toBe(32_000_000);
      expect(profile.housingLoan?.borrowingCap).toBe(40_000_000);
    });

    // 控除可能額 = min(32,000,000, 40,000,000) × 0.7% = 224,000円。この画面のシナリオでは所得税・住民税ともに
    // 課税所得が0円のため、控除可能額の全額(224,000円)が切り捨てとして可視化される
    await waitFor(() => expect(within(main).getByText('控除可能額:')).toBeInTheDocument());
    expect(main.textContent).toContain('224,000円');
    expect(within(main).getByText('⚠')).toBeInTheDocument();
  });

  it('人物を切り替えると控除率欄の入力途中バッファが残らず、新しい人物の値で再表示される(レビュー3巡目是正)', async () => {
    installStoragePersistMock();
    const personAId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateHousingLoan({
      moveInYear: 2023,
      years: 13,
      rate: 0.007,
      yearEndBalance: 10_000_000,
      borrowingCap: 40_000_000,
      residentTaxCapRule: 'rule5pct97500',
    });
    await flushNow();

    const personBId = useAppStore.getState().addPerson('配偶者', '#222222');
    await useAppStore.getState().createBlankYear(2026);
    // 本人と偶然同じ控除率(1%)を持つ別人物のレコード。HousingLoanFormのローカルバッファは
    // value.rateの数値一致だけで「自分自身の入力結果か」を判定するため、たまたま同じ数値の
    // 別レコードに切り替わった場合はその判定だけでは古いバッファと区別できない
    // (レビュー3巡目是正)。本アプリでは人物/年度切替のたびにcalculationResultを一旦nullにする
    // (useAppStore.setActivePerson/setActiveYear)ため、画面のローディング分岐でHousingLoanForm自体が
    // 一旦アンマウントされ実際には再現しないが、HousingLoanScreen側でkey={人物+年度}を付与し
    // コンポーネントの再利用に依存しない形で保証している。この結線が壊れていないことを確認する。
    useAppStore.getState().updateHousingLoan({
      moveInYear: 2023,
      years: 13,
      rate: 0.01,
      yearEndBalance: 20_000_000,
      borrowingCap: 40_000_000,
      residentTaxCapRule: 'rule5pct97500',
    });
    await flushNow();

    await useAppStore.getState().setActivePerson(personAId);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openHousingLoanScreen();

    // 本人の控除率(0.7%)を1%へ編集し、末尾にドットを残した非正規の入力途中状態("1.")にする
    const rateInput = within(main).getByLabelText('控除率');
    await userEvent.clear(rateInput);
    await userEvent.type(rateInput, '1.');
    expect(rateInput).toHaveValue('1.');
    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons.find((p) => p.id === personAId)!.years[2026]!;
      expect(profile.housingLoan?.rate).toBe(0.01);
    });

    await useAppStore.getState().setActivePerson(personBId);
    await flushNow();

    await waitFor(() => expect(within(main).getByLabelText('年末残高')).toHaveValue('20000000'));
    // 配偶者もrate=0.01(表示上は正規化された"1")だが、本人側の非正規バッファ"1."が残っていないこと
    expect(within(main).getByLabelText('控除率')).toHaveValue('1');
  });

  it('前年より年末残高が増加している場合は警告が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2025);
    useAppStore.getState().updateHousingLoan({
      moveInYear: 2023,
      years: 13,
      rate: 0.007,
      yearEndBalance: 30_000_000,
      borrowingCap: 40_000_000,
      residentTaxCapRule: 'rule5pct97500',
    });
    await flushNow();
    await useAppStore.getState().copyYearFromPrevious(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openHousingLoanScreen();

    const balanceInput = within(main).getByLabelText('年末残高');
    await userEvent.clear(balanceInput);
    await userEvent.type(balanceInput, '31000000');

    await waitFor(() => expect(within(main).getByRole('alert')).toHaveTextContent('年末残高が前年'));
  });
});
