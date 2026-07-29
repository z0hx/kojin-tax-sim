// @vitest-environment jsdom
/**
 * レビュー指摘対応(Issue #15): App.tsxで<UpdatePrompt />を3箇所の分岐に重複マウントしていたため
 * loading→main等の状態遷移時にSWが再登録・イベントリスナーがリークするバグがあった(修正済み)。
 * 状態遷移をまたいでもUpdatePromptが再マウントされない(=useRegisterSWが1度しか呼ばれない)ことを
 * 回帰テストとして固定する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const mountCount = vi.fn();
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => {
    // 実際のvite-plugin-pwaのuseRegisterSWもuseStateの遅延初期化でregisterSW()を1度だけ呼ぶ。
    // 同じ仕組みでマウント回数を数える。
    useState(() => {
      mountCount();
      return null;
    });
    return {
      needRefresh: [false, vi.fn()],
      offlineReady: [false, vi.fn()],
      updateServiceWorker: vi.fn(),
    };
  },
}));

import App from '../../App';
import { useAppStore, initialState } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { clearAppData } from '../../persistence/repository';
import { resetSaveQueueForTests } from '../../store/saveQueue';
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
  mountCount.mockClear();
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

describe('App > UpdatePromptのマウント安定性', () => {
  it('読み込み中→オンボーディング→メイン画面と遷移してもUpdatePromptは1度しかマウントされない', async () => {
    installStoragePersistMock();
    render(<App />);
    await waitFor(() => expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument());
    expect(mountCount).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '次へ' }));
    const nameInput = screen.getByLabelText('表示名');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '本人');
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));
    await userEvent.type(screen.getByLabelText('都道府県'), '神奈川県');
    await userEvent.type(screen.getByLabelText('市区町村'), '横浜市');
    await userEvent.click(screen.getByRole('button', { name: '完了' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /本人/ })).toBeInTheDocument());
    expect(mountCount).toHaveBeenCalledTimes(1);
  });
});
