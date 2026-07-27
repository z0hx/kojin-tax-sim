import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
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
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    confirmRef.current?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!busy) onCancel();
        return;
      }
      // フォーカス可能な要素はcancel/confirmの2つだけなので、その間だけTabで循環させる(簡易フォーカストラップ)
      if (e.key === 'Tab') {
        const active = document.activeElement;
        if (e.shiftKey && active === cancelRef.current) {
          e.preventDefault();
          confirmRef.current?.focus();
        } else if (!e.shiftKey && active === confirmRef.current) {
          e.preventDefault();
          cancelRef.current?.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onCancel, busy]);

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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
          <button ref={cancelRef} type="button" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={danger ? { background: 'var(--color-danger)', color: '#fff', border: 'none' } : undefined}
          >
            {busy ? '処理中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
