import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { parseNonNegativeInt } from '../parseAmount';

interface AmountInputProps {
  value: number;
  onChange: (value: number) => void;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  className?: string;
  style?: CSSProperties;
  disabled?: boolean;
}

/**
 * 0以上の整数を入力する金額欄の共通UI。
 * - 桁区切りカンマ付きのペースト("1,000,000"等)を許容する(parseNonNegativeIntがカンマを除去してからパースする)
 * - フォーカス時、表示中の値が0なら空にする(0を消してから打ち直す手間を無くすため)
 * - 空のままフォーカスを外すと表示を直近の値に戻す(空欄のままだと0が入力されていることが分かりにくいため)
 */
export function AmountInput({ value, onChange, ariaLabel, ariaDescribedBy, className, style, disabled }: AmountInputProps) {
  const [text, setText] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (!focusedRef.current) setText(String(value));
  }, [value]);

  return (
    <input
      className={className}
      type="text"
      inputMode="numeric"
      aria-label={ariaLabel}
      aria-describedby={ariaDescribedBy}
      disabled={disabled}
      style={style}
      value={text}
      onFocus={() => {
        focusedRef.current = true;
        if (value === 0) setText('');
      }}
      onBlur={() => {
        focusedRef.current = false;
        if (text.trim() === '') setText(String(value));
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        const n = parseNonNegativeInt(next);
        if (n !== null) onChange(n);
      }}
    />
  );
}
