import { useState } from 'react';
import type { DisabilityInput } from '../../domain/types';

interface DisabilityDeductionFormProps {
  value: DisabilityInput[];
  onChange: (value: DisabilityInput[]) => void;
}

const SEVERITY_LABELS: Record<DisabilityInput['severity'], string> = {
  general: '一般障害者',
  special: '特別障害者',
  specialCoresident: '同居特別障害者',
};

/** S-03 障害者控除欄(02仕様書§3.2、FR-05)。区分(一般/特別/同居特別)ごとに追加・削除する。 */
export function DisabilityDeductionForm({ value, onChange }: DisabilityDeductionFormProps) {
  const [severity, setSeverity] = useState<DisabilityInput['severity']>('general');

  function handleAdd() {
    onChange([...value, { severity }]);
  }

  function handleRemove(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <label>
          区分
          <select value={severity} onChange={(e) => setSeverity(e.target.value as DisabilityInput['severity'])} style={{ marginLeft: '0.25rem' }}>
            {(Object.entries(SEVERITY_LABELS) as [DisabilityInput['severity'], string][]).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={handleAdd}>
          ＋ 追加
        </button>
      </div>
      {value.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>区分</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {value.map((d, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--color-border)' }}>
                <td style={{ padding: '0.25rem 0.5rem' }}>{SEVERITY_LABELS[d.severity]}</td>
                <td style={{ padding: '0.25rem 0.5rem' }}>
                  <button type="button" onClick={() => handleRemove(i)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
