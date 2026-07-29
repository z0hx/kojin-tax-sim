import { monthsInRange } from '../../domain/income';
import type { LeavePeriod, MonthlyRecord } from '../../domain/types';

interface MonthlyIncomeGridProps {
  monthly: MonthlyRecord[];
  leavePeriods: LeavePeriod[];
  year: number;
  onChange: (monthly: MonthlyRecord[]) => void;
}

function exemptMonthSet(leavePeriods: LeavePeriod[], year: number): Set<number> {
  const set = new Set<number>();
  for (const lp of leavePeriods) {
    for (const m of monthsInRange(lp.startYm, lp.endYm, year)) set.add(m);
  }
  return set;
}

/** 0以上の整数以外はnull(呼び出し側で無視し、入力欄には無効な文字列を残さない) */
function parseYen(input: string): number | null {
  if (input.trim().length === 0) return 0;
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * S-02の12ヶ月グリッド(02仕様書§5)。
 * 育休対象月かどうかは保存済みのisSocialInsuranceExemptを信用せず、常にleavePeriodsから導出して表示する
 * (設計上の理由: applyLeavePeriodsの結果を生データへ書き戻すと、育休期間を後から編集/削除しても
 *  書き戻された免除フラグが残り、対象月がロックされたまま戻らなくなるため)。
 * 実際の税計算はengine.calcSnapshotが都度applyLeavePeriodsを適用するため、この画面が生データへ
 * 書き戻さなくても計算結果は正しい。
 */
export function MonthlyIncomeGrid({ monthly, leavePeriods, year, onChange }: MonthlyIncomeGridProps) {
  const exempt = exemptMonthSet(leavePeriods, year);

  function updateMonth(month: number, patch: Partial<MonthlyRecord>) {
    onChange(monthly.map((m) => (m.month === month ? { ...m, ...patch } : m)));
  }

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>月</th>
          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>状態</th>
          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>給与</th>
          <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>社会保険料</th>
        </tr>
      </thead>
      <tbody>
        {monthly.map((rec) => {
          const isExempt = exempt.has(rec.month);
          return (
            <tr key={rec.month} style={{ borderTop: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.25rem 0.5rem' }}>{rec.month}月</td>
              <td style={{ padding: '0.25rem 0.5rem' }}>
                <label>
                  <input
                    type="radio"
                    name={`status-${rec.month}`}
                    checked={rec.status === 'actual'}
                    disabled={isExempt}
                    onChange={() => updateMonth(rec.month, { status: 'actual' })}
                  />
                  実績
                </label>
                <label style={{ marginLeft: '0.5rem' }}>
                  <input
                    type="radio"
                    name={`status-${rec.month}`}
                    checked={rec.status === 'estimated'}
                    disabled={isExempt}
                    onChange={() => updateMonth(rec.month, { status: 'estimated' })}
                  />
                  見込み
                </label>
              </td>
              <td style={{ padding: '0.25rem 0.5rem' }}>
                <input
                  className="amount"
                  type="text"
                  inputMode="numeric"
                  aria-label={`${rec.month}月の給与`}
                  value={isExempt ? 0 : rec.grossSalary}
                  disabled={isExempt}
                  onChange={(e) => {
                    const v = parseYen(e.target.value);
                    if (v !== null) updateMonth(rec.month, { grossSalary: v });
                  }}
                  style={{ width: '8rem' }}
                />
              </td>
              <td style={{ padding: '0.25rem 0.5rem' }}>
                <input
                  className="amount"
                  type="text"
                  inputMode="numeric"
                  aria-label={`${rec.month}月の社会保険料`}
                  value={isExempt ? 0 : rec.socialInsurance}
                  disabled={isExempt}
                  onChange={(e) => {
                    const v = parseYen(e.target.value);
                    if (v !== null) updateMonth(rec.month, { socialInsurance: v });
                  }}
                  style={{ width: '8rem' }}
                />
                {isExempt && (
                  <span style={{ marginLeft: '0.5rem', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                    育休期間のため0円・社会保険料免除に自動設定されます(この画面では変更できません。育休期間の設定を編集してください)
                  </span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
