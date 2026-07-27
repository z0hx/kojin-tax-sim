import type { Warning } from '../../domain/types';
import { resolveWarningMessage } from '../warningMessages';

interface WarningBannerListProps {
  warnings: Warning[];
}

const SEVERITY_STYLE: Record<Warning['severity'], { icon: string; color: string; background: string }> = {
  critical: { icon: '⚠', color: 'var(--color-danger)', background: 'var(--color-danger-bg)' },
  caution: { icon: '⚠', color: 'var(--color-warning)', background: 'var(--color-warning-bg)' },
  info: { icon: 'ℹ', color: 'var(--color-fg)', background: 'var(--color-selected-bg)' },
};

/**
 * S-01ダッシュボードの警告一覧(Issue #9完了条件: W-01〜W-08が正しい条件で発火し表示される)。
 * calculationResult.warningsをそのまま表示するのみで、発火条件の判定はdomain/warnings.tsに一任する
 * (UI側で条件を再実装しない。実装後レビューで繰り返し指摘されてきたロジック重複によるドリフト防止)。
 */
export function WarningBannerList({ warnings }: WarningBannerListProps) {
  if (warnings.length === 0) {
    return <p style={{ color: 'var(--color-muted)' }}>現在、警告はありません。</p>;
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {warnings.map((w) => {
        const style = SEVERITY_STYLE[w.severity];
        return (
          <li
            key={w.id}
            role="alert"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.5rem',
              padding: '0.6rem 0.8rem',
              borderRadius: 6,
              background: style.background,
              color: style.color,
            }}
          >
            <span aria-hidden="true">{style.icon}</span>
            <span>
              <strong style={{ fontSize: '0.75rem', opacity: 0.8 }}>{w.id}</strong>
              <br />
              {resolveWarningMessage(w)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
