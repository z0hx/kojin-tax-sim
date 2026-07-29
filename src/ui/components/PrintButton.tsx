import type { CSSProperties } from 'react';

interface PrintButtonProps {
  style?: CSSProperties;
}

/** FR-20(結果出力): 専用のPDF生成は行わず、ブラウザ標準の印刷機能(window.print)を呼ぶだけの共通ボタン。
 *  印刷結果自体には不要なため、常にno-print(印刷対象外)にする。 */
export function PrintButton({ style }: PrintButtonProps) {
  return (
    <button className="no-print" type="button" style={style} onClick={() => window.print()}>
      印刷
    </button>
  );
}
