// @vitest-environment jsdom
/**
 * S-03 控除入力画面の統合テスト。IncomeScreen.test.tsxと同様、実際のZustandストア
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
import { StorageError } from '../../persistence/errors';
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

async function openDeductionsScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '控除入力' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /控除入力/ })).toBeInTheDocument());
  return screen.getByRole('heading', { name: /控除入力/ }).closest('main') as HTMLElement;
}

describe('DeductionsScreen(S-03)', () => {
  it('人物の年度データが無い場合は収入入力画面への案内が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDeductionsScreen();

    expect(within(main).getByText('この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。')).toBeInTheDocument();
    await userEvent.click(within(main).getByRole('button', { name: '収入入力へ' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  });

  it('iDeCo入力がstoreのdeductions.idecoへ反映され再計算される', async () => {
    installStoragePersistMock();
    const personId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openDeductionsScreen();

    const idecoInput = within(main).getByLabelText('iDeCo年間掛金合計');
    await userEvent.clear(idecoInput);
    await userEvent.type(idecoInput, '276000');

    await waitFor(() => {
      const profile = useAppStore.getState().appData!.persons.find((p) => p.id === personId)!.years[2026]!;
      expect(profile.deductions.ideco).toBe(276000);
    });
  });

  it('2026年分は生命保険料の23歳未満特例トグルが有効、2025年分は無効になる', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();
    await renderAppAndWaitLoaded();
    let main = await openDeductionsScreen();
    await waitFor(() => expect(within(main).getByRole('checkbox', { name: /23歳未満/ })).not.toBeDisabled());

    await useAppStore.getState().createBlankYear(2025);
    await flushNow();
    cleanup();
    await renderAppAndWaitLoaded();
    main = await openDeductionsScreen();
    await waitFor(() => expect(within(main).getByRole('checkbox', { name: /23歳未満/ })).toBeDisabled());
  });

  it('医療費控除欄に足切り根拠と有利判定結果が表示される(FR-06完了条件)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();
    await renderAppAndWaitLoaded();
    const main = await openDeductionsScreen();

    expect(within(main).getByText(/採用方式:/)).toBeInTheDocument();
    expect(within(main).getByText(/足切り額:/)).toBeInTheDocument();
  });

  it('医療費を入力しワンストップ特例選択中の場合、確定申告が必要な旨の警告が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();
    await renderAppAndWaitLoaded();
    const main = await openDeductionsScreen();

    const paidInput = within(main).getByLabelText('支払医療費');
    await userEvent.clear(paidInput);
    await userEvent.type(paidInput, '150000');

    await waitFor(() => expect(within(main).getByText(/ワンストップ特例は利用できません/)).toBeInTheDocument());
  });

  it('無関係な操作由来のlastErrorが残っていても、控除入力欄はブロックされずバナー表示のみになる(実装後レビュー対応)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();
    await renderAppAndWaitLoaded();

    // エクスポート失敗等、控除入力と無関係な操作でlastErrorがセットされている状況を再現する
    useAppStore.setState({ lastError: new StorageError('エクスポートに失敗しました。') });

    const main = await openDeductionsScreen();
    expect(within(main).getByRole('alert')).toHaveTextContent('エクスポートに失敗しました。');
    // バナーは出るが、入力欄自体は隠れずに操作できる
    expect(within(main).getByLabelText('iDeCo年間掛金合計')).toBeInTheDocument();

    await userEvent.click(within(main).getByRole('button', { name: '閉じる' }));
    expect(useAppStore.getState().lastError).toBeNull();
  });
});
