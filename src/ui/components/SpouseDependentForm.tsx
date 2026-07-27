import { useState } from 'react';
import type { Dependent, SpouseInput } from '../../domain/types';
import { parseNonNegativeInt } from '../parseAmount';

interface SpouseDependentFormProps {
  spouse: SpouseInput | undefined;
  dependents: Dependent[];
  onChangeSpouse: (spouse: SpouseInput | undefined) => void;
  onChangeDependents: (dependents: Dependent[]) => void;
}

/** 扶養控除の対象は16歳以上(domain/deductions.tsのDEPENDENT_MIN_AGEと同じ基準)。
 *  年少扶養親族は児童手当に一本化されているため対象外。 */
const DEPENDENT_MIN_AGE = 16;

/** S-03 配偶者控除・扶養控除欄(02仕様書§3.2、FR-05)。 */
export function SpouseDependentForm({ spouse, dependents, onChangeSpouse, onChangeDependents }: SpouseDependentFormProps) {
  const [ageInput, setAgeInput] = useState('0');
  const [isCoresidentElderlyParent, setIsCoresidentElderlyParent] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function handleSpouseToggle(checked: boolean) {
    onChangeSpouse(checked ? { totalIncome: 0, isElderly: false } : undefined);
  }

  function handleAddDependent() {
    const age = parseNonNegativeInt(ageInput);
    if (age === null) {
      setAddError('年齢は0以上の整数で入力してください');
      return;
    }
    setAddError(null);
    const dependent: Dependent = {
      id: crypto.randomUUID(),
      age,
      isCoresidentElderlyParent: age >= 70 ? isCoresidentElderlyParent : undefined,
    };
    onChangeDependents([...dependents, dependent]);
    setIsCoresidentElderlyParent(false);
  }

  function handleRemoveDependent(id: string) {
    onChangeDependents(dependents.filter((d) => d.id !== id));
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.4rem' }}>配偶者</h3>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <input type="checkbox" checked={spouse !== undefined} onChange={(e) => handleSpouseToggle(e.target.checked)} />
          配偶者控除・配偶者特別控除の対象とする
        </label>
        {spouse && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.5rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ minWidth: '9rem' }}>配偶者の合計所得金額</span>
              <input
                className="amount"
                type="text"
                inputMode="numeric"
                aria-label="配偶者の合計所得金額"
                value={spouse.totalIncome}
                onChange={(e) => {
                  const n = parseNonNegativeInt(e.target.value);
                  if (n !== null) onChangeSpouse({ ...spouse, totalIncome: n });
                }}
                style={{ width: '8rem' }}
              />
              円
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input type="checkbox" checked={spouse.isElderly ?? false} onChange={(e) => onChangeSpouse({ ...spouse, isElderly: e.target.checked })} />
              老人控除対象配偶者(70歳以上)
            </label>
          </div>
        )}
      </div>

      <div>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.4rem' }}>扶養親族</h3>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            年齢
            <input
              type="text"
              inputMode="numeric"
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              style={{ marginLeft: '0.25rem', width: '5rem' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input
              type="checkbox"
              checked={isCoresidentElderlyParent}
              disabled={(parseNonNegativeInt(ageInput) ?? 0) < 70}
              onChange={(e) => setIsCoresidentElderlyParent(e.target.checked)}
            />
            同居老親等
          </label>
          <button type="button" onClick={handleAddDependent}>
            ＋ 扶養親族を追加
          </button>
        </div>
        {(parseNonNegativeInt(ageInput) ?? 0) < DEPENDENT_MIN_AGE && (
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            16歳未満は扶養控除の対象外です(児童手当の対象のため)。追加はできますが控除額には反映されません。
          </p>
        )}
        {addError && (
          <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>
            {addError}
          </p>
        )}
        {dependents.length > 0 && (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>年齢</th>
                <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>同居老親等</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {dependents.map((d) => (
                <tr key={d.id} style={{ borderTop: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    {d.age}歳
                    {d.age < DEPENDENT_MIN_AGE && (
                      <span style={{ marginLeft: '0.4rem', fontSize: '0.8rem', color: 'var(--color-muted)' }}>(控除対象外)</span>
                    )}
                  </td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>{d.isCoresidentElderlyParent ? '該当' : '—'}</td>
                  <td style={{ padding: '0.25rem 0.5rem' }}>
                    <button type="button" onClick={() => handleRemoveDependent(d.id)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
