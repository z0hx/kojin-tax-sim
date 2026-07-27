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

  it('busy中はEscapeキーでonCancelが呼ばれない(レビューで発見: 処理中に閉じられる不整合の是正)', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="t" message="m" busy onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('busy中は背景クリックでonCancelが呼ばれない', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog title="t" message="m" busy onConfirm={vi.fn()} onCancel={onCancel} />);
    await userEvent.click(screen.getByRole('presentation'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  describe('requireTypedText(S-09 全データ削除の要確認入力)', () => {
    it('指定した文字列と一致するまで確認ボタンが無効化される', async () => {
      const onConfirm = vi.fn();
      render(<ConfirmDialog title="t" message="m" requireTypedText="削除" confirmLabel="削除する" onConfirm={onConfirm} onCancel={vi.fn()} />);

      const confirmButton = screen.getByRole('button', { name: '削除する' });
      expect(confirmButton).toBeDisabled();

      const input = screen.getByLabelText('続行するには「削除」と入力してください');
      await userEvent.type(input, '削');
      expect(confirmButton).toBeDisabled();

      await userEvent.type(input, '除');
      expect(confirmButton).toBeEnabled();

      await userEvent.click(confirmButton);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('入力欄に自動フォーカスする', () => {
      render(<ConfirmDialog title="t" message="m" requireTypedText="削除" onConfirm={vi.fn()} onCancel={vi.fn()} />);
      expect(screen.getByLabelText('続行するには「削除」と入力してください')).toHaveFocus();
    });

    it('一部一致や余分な文字列では確認ボタンが有効化されない', async () => {
      render(<ConfirmDialog title="t" message="m" requireTypedText="削除" confirmLabel="削除する" onConfirm={vi.fn()} onCancel={vi.fn()} />);
      const input = screen.getByLabelText('続行するには「削除」と入力してください');
      await userEvent.type(input, '削除する');
      expect(screen.getByRole('button', { name: '削除する' })).toBeDisabled();
    });
  });
});
