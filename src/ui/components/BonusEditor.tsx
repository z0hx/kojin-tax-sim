import { useState } from 'react';
import { isBonusExempt } from '../../domain/income';
import type { Bonus, LeavePeriod } from '../../domain/types';

interface BonusEditorProps {
  bonuses: Bonus[];
  leavePeriods: LeavePeriod[];
  year: number;
  onChange: (bonuses: Bonus[]) => void;
}

function parseNonNegativeInt(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * S-02 賞与エディタ(FR-02: 「1〜12月の給与・賞与・社会保険料を月単位で入力」)。
 * isExemptは保存値を信用せず、常にisBonusExempt(現在のleavePeriods基準)で導出表示する。
 * 育休期間を後から変更しても表示が追従するようにするため(MonthlyIncomeGridと同じ方針)。
 */
export function BonusEditor({ bonuses, leavePeriods, year, onChange }: BonusEditorProps) {
  const [label, setLabel] = useState('');
  const [month, setMonth] = useState(1);
  const [status, setStatus] = useState<'actual' | 'estimated'>('estimated');
  const [gross, setGross] = useState('0');
  const [socialInsurance, setSocialInsurance] = useState('0');
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    setError(null);
    const trimmedLabel = label.trim();
    if (trimmedLabel.length === 0) {
      setError('賞与の名称を入力してください');
      return;
    }
    const grossValue = parseNonNegativeInt(gross);
    const socialValue = parseNonNegativeInt(socialInsurance);
    if (grossValue === null || socialValue === null) {
      setError('金額は0以上の整数で入力してください');
      return;
    }
    const draft: Bonus = { label: trimmedLabel, month, status, gross: grossValue, socialInsurance: socialValue, isExempt: false };
    const newBonus: Bonus = { ...draft, isExempt: isBonusExempt(draft, leavePeriods, year) };
    onChange([...bonuses, newBonus]);
    setLabel('');
    setGross('0');
    setSocialInsurance('0');
  }

  function handleRemove(index: number) {
    onChange(bonuses.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          名称
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="例: 夏季賞与" style={{ marginLeft: '0.25rem', width: '8rem' }} />
        </label>
        <label>
          支給月
          <select value={month} onChange={(e) => setMonth(Number(e.target.value))} style={{ marginLeft: '0.25rem' }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </label>
        <label>
          状態
          <select value={status} onChange={(e) => setStatus(e.target.value as 'actual' | 'estimated')} style={{ marginLeft: '0.25rem' }}>
            <option value="actual">実績</option>
            <option value="estimated">見込み</option>
          </select>
        </label>
        <label>
          総支給額(円)
          <input className="amount" type="text" inputMode="numeric" value={gross} onChange={(e) => setGross(e.target.value)} style={{ marginLeft: '0.25rem', width: '8rem' }} />
        </label>
        <label>
          社会保険料(円)
          <input
            className="amount"
            type="text"
            inputMode="numeric"
            value={socialInsurance}
            onChange={(e) => setSocialInsurance(e.target.value)}
            style={{ marginLeft: '0.25rem', width: '8rem' }}
          />
        </label>
        <button type="button" onClick={handleAdd}>
          ＋ 賞与を追加
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>
          {error}
        </p>
      )}

      {bonuses.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>名称</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>支給月</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>状態</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>総支給額</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>社会保険料</th>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>免除</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {bonuses.map((b, i) => {
              const exempt = isBonusExempt(b, leavePeriods, year);
              return (
                <tr key={`${b.label}-${b.month}-${i}`} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{b.label}</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{b.month}月</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{b.status === 'actual' ? '実績' : '見込み'}</td>
                  <td className="amount" style={{ padding: '0.25rem 0.5rem' }}>
                    {b.gross.toLocaleString()}円
                  </td>
                  <td className="amount" style={{ padding: '0.25rem 0.5rem' }}>
                    {exempt ? 0 : b.socialInsurance.toLocaleString()}円
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{exempt ? '社保免除(育休)' : '—'}</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    <button type="button" onClick={() => handleRemove(i)}>
                      削除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
