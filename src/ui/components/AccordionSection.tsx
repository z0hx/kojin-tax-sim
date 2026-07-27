import type { ReactNode } from 'react';

interface AccordionSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * S-03控除入力画面向けの軽量アコーディオン(03詳細設計書§3.3, Issue #7)。
 * ネイティブ<details>の`open`属性をdefaultOpenの初期値としてのみ使う。defaultOpen自体は
 * 再レンダーの間で値が変わらないため、Reactは同一値のprops diffではDOM属性を書き戻さない。
 * これによりユーザーがブラウザネイティブの開閉操作をしても、以後の再レンダーで開閉状態が
 * 勝手に巻き戻ることはない。
 */
export function AccordionSection({ title, defaultOpen = true, children }: AccordionSectionProps) {
  return (
    <details open={defaultOpen} style={{ border: '1px solid var(--color-border)', borderRadius: 6, marginTop: '0.75rem' }}>
      <summary style={{ padding: '0.6rem 0.8rem', cursor: 'pointer', fontWeight: 600 }}>{title}</summary>
      <div style={{ padding: '0 0.8rem 0.8rem' }}>{children}</div>
    </details>
  );
}
