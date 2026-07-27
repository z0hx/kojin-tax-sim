import { useEffect, useRef, useState } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  /** 指定した場合、この文字列と完全一致する入力があるまで確認ボタンを無効化する(破壊性の高い操作向け、02仕様書§5 S-09「要確認入力」) */
  requireTypedText?: string;
  /** requireTypedText用の入力欄ラベル。省略時は既定文言を使う */
  requireTypedTextLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 汎用の確認モーダル。削除等の破壊的操作の前に使う(02仕様書§5 S-10「確認」要件) */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'OK',
  cancelLabel = 'キャンセル',
  danger = false,
  busy = false,
  requireTypedText,
  requireTypedTextLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const typedInputRef = useRef<HTMLInputElement>(null);
  const [typedText, setTypedText] = useState('');

  const confirmDisabled = busy || (requireTypedText !== undefined && typedText !== requireTypedText);

  useEffect(() => {
    if (requireTypedText !== undefined) {
      typedInputRef.current?.focus();
    } else {
      confirmRef.current?.focus();
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busy) onCancel();
        return;
      }
      // フォーカス可能な要素(無効化されたものは除く)をダイアログ内から都度取得し、その間だけTabで循環させる
      // (簡易フォーカストラップ。要確認入力欄の有無によらず動くよう固定要素数を前提にしない)
      if (e.key === 'Tab') {
        const focusables = dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
        if (!focusables || focusables.length === 0) return;
        const list = Array.from(focusables);
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, busy, requireTypedText]);

  return (
    <div
      role="presentation"
      onClick={() => {
        if (!busy) onCancel();
      }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--color-bg)',
          color: 'var(--color-fg)',
          border: '1px solid var(--color-border)',
          borderRadius: 8,
          padding: '1.25rem',
          maxWidth: 420,
          width: '90%',
        }}
      >
        <h2 id="confirm-dialog-title" style={{ marginTop: 0, fontSize: '1.05rem' }}>
          {title}
        </h2>
        <p style={{ whiteSpace: 'pre-wrap' }}>{message}</p>
        {requireTypedText !== undefined && (
          <label style={{ display: 'block', marginTop: '0.75rem', fontSize: '0.85rem' }}>
            {requireTypedTextLabel ?? `続行するには「${requireTypedText}」と入力してください`}
            <input
              ref={typedInputRef}
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              disabled={busy}
              autoComplete="off"
              style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
            />
          </label>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={confirmDisabled}
            style={danger ? { background: 'var(--color-danger)', color: '#fff', border: 'none' } : undefined}
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
