import type { CSSProperties } from 'react';

/**
 * rechartsのTooltipは吹き出しの背景・枠線・文字色をインラインstyleで白基調に固定して描画するため、
 * CSSからは上書きできない(インラインstyleのほうが優先される)。ダークモードで白い吹き出しが出るのを
 * 避けるため、配色トークンを使ったstyleをpropsとして渡す。グラフを持つ画面が共通で参照する。
 */
export const tooltipContentStyle: CSSProperties = {
  background: 'var(--color-bg)',
  border: `1px solid var(--color-border)`,
  borderRadius: 4,
  color: 'var(--color-fg)',
};

/** 吹き出しの見出し(寄附額など)。本文と同じ配色にしつつ、既定の黒固定を打ち消す */
export const tooltipLabelStyle: CSSProperties = {
  color: 'var(--color-fg)',
};
