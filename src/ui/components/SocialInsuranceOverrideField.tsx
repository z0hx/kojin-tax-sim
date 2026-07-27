import { useState } from 'react';
import type { Yen } from '../../domain/types';
import { parseNonNegativeInt } from '../parseAmount';

interface SocialInsuranceOverrideFieldProps {
  actualSum: Yen;
  value: number | undefined;
  onChange: (value: number | undefined) => void;
}

/**
 * S-03 社会保険料控除欄。`actualSum`は月次・賞与の実績/見込みから自動集計した値
 * (呼び出し側で育休期間の免除を反映済みの値を渡すこと。engine.calcSnapshotが実際に使う値と
 * 一致させるため)。デフォルトは自動集計値をそのまま使い、必要な場合のみ手入力で上書きする。
 */
export function SocialInsuranceOverrideField({ actualSum, value, onChange }: SocialInsuranceOverrideFieldProps) {
  const overridden = value !== undefined;
  const [draft, setDraft] = useState(String(value ?? actualSum));
  const [error, setError] = useState<string | null>(null);

  function handleToggle(checked: boolean) {
    if (checked) {
      setDraft(String(value ?? actualSum));
      setError(null);
      onChange(value ?? actualSum);
    } else {
      setError(null);
      onChange(undefined);
    }
  }

  function handleDraftChange(text: string) {
    setDraft(text);
    const n = parseNonNegativeInt(text);
    if (n === null) {
      setError('社会保険料は0以上の整数で入力してください');
      return;
    }
    setError(null);
    onChange(n);
  }

  return (
    <div>
      <p style={{ margin: '0 0 0.5rem' }}>
        自動集計値(実績+見込みの合計、育休免除を反映済み): <span className="amount">{actualSum.toLocaleString()}円</span>
      </p>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <input type="checkbox" checked={overridden} onChange={(e) => handleToggle(e.target.checked)} />
        自動集計値を上書きする(源泉徴収票等の実額と差がある場合)
      </label>
      {overridden && (
        <label style={{ display: 'block', marginTop: '0.5rem' }}>
          社会保険料(上書き)
          <input
            className="amount"
            type="text"
            inputMode="numeric"
            value={draft}
            onChange={(e) => handleDraftChange(e.target.value)}
            style={{ marginLeft: '0.5rem', width: '10rem' }}
          />
        </label>
      )}
      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>
          {error}
        </p>
      )}
    </div>
  );
}
