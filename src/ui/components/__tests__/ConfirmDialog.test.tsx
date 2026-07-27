// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { ConfirmDialog } from '../ConfirmDialog';

// globals:falseのためRTLの自動cleanupが働かず、明示的に呼ぶ必要がある
afterEach(cleanup);

describe('ConfirmDialog', () => {
  it('タイトルとメッセージを表示し、確認ボタンでonConfirmを呼ぶ', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="削除しますか?" message="元に戻せません" onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByRole('dialog')).toHaveTextContent('削除しますか?');
    expect(screen.getByText('元に戻せません')).toBeInTheDocument();

    await userEvent.click(screen.getByText('OK'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('キャンセルボタンでonCancelを呼ぶ', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="t" message="m" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.click(screen.getByText('キャンセル'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Escapeキーでoncancelを呼ぶ', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog title="t" message="m" onConfirm={onConfirm} onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('busy中はボタンが無効化される', () => {
    render(<ConfirmDialog title="t" message="m" busy onConfirm={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText('処理中…')).toBeDisabled();
    expect(screen.getByText('キャンセル')).toBeDisabled();
  });
});
