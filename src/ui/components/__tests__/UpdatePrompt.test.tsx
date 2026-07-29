// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const updateServiceWorker = vi.fn();
const setNeedRefresh = vi.fn();
const setOfflineReady = vi.fn();
let needRefreshState = false;
let offlineReadyState = false;

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [needRefreshState, setNeedRefresh],
    offlineReady: [offlineReadyState, setOfflineReady],
    updateServiceWorker,
  }),
}));

import { UpdatePrompt } from '../UpdatePrompt';

afterEach(cleanup);

describe('UpdatePrompt(Issue #15完了条件: NFR-14 SW更新検知時に明示的な再読み込みを促す)', () => {
  beforeEach(() => {
    needRefreshState = false;
    offlineReadyState = false;
    vi.clearAllMocks();
  });

  it('needRefresh/offlineReadyがどちらもfalseなら何も表示しない', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('needRefresh=trueのとき更新案内と再読み込みボタンを表示し、クリックでupdateServiceWorker(true)を呼ぶ', async () => {
    needRefreshState = true;
    render(<UpdatePrompt />);
    expect(screen.getByText(/新しいバージョンが利用可能です/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(updateServiceWorker).toHaveBeenCalledWith(true);
  });

  it('offlineReady=trueのときオフライン利用可能メッセージを表示する', () => {
    offlineReadyState = true;
    render(<UpdatePrompt />);
    expect(screen.getByText(/オフラインでも利用できるようになりました/)).toBeInTheDocument();
  });

  it('閉じるボタンでneedRefresh/offlineReadyの両方をfalseに戻す', async () => {
    needRefreshState = true;
    render(<UpdatePrompt />);
    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(setNeedRefresh).toHaveBeenCalledWith(false);
    expect(setOfflineReady).toHaveBeenCalledWith(false);
  });
});
