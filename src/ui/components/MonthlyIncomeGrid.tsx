import type { CSSProperties } from 'react';
import { monthsInRange, resolveMonthlySocialInsurance } from '../../domain/income';
import {
  emptySocialInsuranceBreakdown,
  SOCIAL_INSURANCE_ITEMS,
  type LeavePeriod,
  type MonthlyRecord,
  type SocialInsuranceBreakdown,
} from '../../domain/types';

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

const CELL: CSSProperties = { padding: '0.25rem 0.5rem', verticalAlign: 'top' };
const HINT: CSSProperties = { fontSize: '0.8rem', color: 'var(--color-muted)' };

/**
 * S-02の12ヶ月グリッド(02仕様書§5)。
 * 育休対象月かどうかは保存済みのisSocialInsuranceExemptを信用せず、常にleavePeriodsから導出して表示する
 * (設計上の理由: applyLeavePeriodsの結果を生データへ書き戻すと、育休期間を後から編集/削除しても
 *  書き戻された免除フラグが残り、対象月がロックされたまま戻らなくなるため)。
 * 実際の税計算はengine.calcSnapshotが都度applyLeavePeriodsを適用するため、この画面が生データへ
 * 書き戻さなくても計算結果は正しい。
 *
 * 社会保険料は月ごとに「一括入力」と「内訳入力(健康保険料・介護保険料・厚生年金保険料・雇用保険料・その他)」を
 * 選べる(Issue #48)。内訳入力に切り替えても一括入力額は保持し、戻したときに復元する。どちらの値が
 * 計算に使われるかはdomain/income.resolveMonthlySocialInsuranceが単独で決める。
 */
export function MonthlyIncomeGrid({ monthly, leavePeriods, year, onChange }: MonthlyIncomeGridProps) {
  const exempt = exemptMonthSet(leavePeriods, year);

  function updateMonth(month: number, patch: Partial<MonthlyRecord>) {
    onChange(monthly.map((m) => (m.month === month ? { ...m, ...patch } : m)));
  }

  function updateBreakdown(rec: MonthlyRecord, key: keyof SocialInsuranceBreakdown, value: number) {
    const current = rec.socialInsuranceBreakdown ?? emptySocialInsuranceBreakdown();
    updateMonth(rec.month, { socialInsuranceBreakdown: { ...current, [key]: value } });
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
          // 表示の判定はresolveMonthlySocialInsuranceの条件と同一にする。モードだけ'breakdown'で内訳が
          // 欠けている取り込みデータでは計算に一括入力額が使われるため、画面も一括入力として見せる
          const isBreakdown = rec.socialInsuranceInputMode === 'breakdown' && rec.socialInsuranceBreakdown !== undefined;
          const breakdown = rec.socialInsuranceBreakdown ?? emptySocialInsuranceBreakdown();
          const resolved = isExempt ? 0 : resolveMonthlySocialInsurance(rec);
          return (
            <tr key={rec.month} style={{ borderTop: '1px solid var(--color-border)' }}>
              <td style={CELL}>{rec.month}月</td>
              <td style={CELL}>
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
              <td style={CELL}>
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
              <td style={CELL}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <select
                      aria-label={`${rec.month}月の社会保険料の入力方法`}
                      value={isBreakdown ? 'breakdown' : 'total'}
                      disabled={isExempt}
                      onChange={(e) =>
                        // 内訳入力へ切り替えるときに内訳を実体化する(モードだけ立って内訳が無い状態を作らない)。
                        // 一括入力へ戻すときは内訳を残し、再度切り替えたときに復元できるようにする
                        updateMonth(
                          rec.month,
                          e.target.value === 'breakdown'
                            ? {
                                socialInsuranceInputMode: 'breakdown',
                                socialInsuranceBreakdown: rec.socialInsuranceBreakdown ?? emptySocialInsuranceBreakdown(),
                              }
                            : { socialInsuranceInputMode: 'total' }
                        )
                      }
                    >
                      <option value="total">一括入力</option>
                      <option value="breakdown">内訳入力</option>
                    </select>
                    {/* 育休対象月は内訳入力を選んでいても、0円固定であることが分かる一括入力欄を出す
                        (他の月と同じ形で「0円・変更不可」を示すため) */}
                    {(!isBreakdown || isExempt) && (
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
                    )}
                  </div>

                  {isBreakdown && !isExempt && (
                    <>
                      {SOCIAL_INSURANCE_ITEMS.map((item) => (
                        <label key={item.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                          <span style={{ minWidth: '7rem' }}>{item.label}</span>
                          <input
                            className="amount"
                            type="text"
                            inputMode="numeric"
                            aria-label={`${rec.month}月の${item.label}`}
                            value={breakdown[item.key]}
                            onChange={(e) => {
                              const v = parseYen(e.target.value);
                              if (v !== null) updateBreakdown(rec, item.key, v);
                            }}
                            style={{ width: '8rem' }}
                          />
                        </label>
                      ))}
                      <p style={{ margin: 0, fontSize: '0.85rem' }}>
                        内訳の合計 <span className="amount">{resolved.toLocaleString()}円</span>
                      </p>
                      {/* 内訳が未入力のまま切り替えると、一括入力額が残っていても0円で計算される。
                          どちらの値が使われるかを取り違えないよう明示する */}
                      {resolved === 0 && rec.socialInsurance > 0 && (
                        <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-warning)' }}>
                          {`内訳が未入力のため0円として計算されます(一括入力の${rec.socialInsurance.toLocaleString()}円は使われません。一括入力に戻すと復元されます)`}
                        </p>
                      )}
                    </>
                  )}

                  {isExempt && (
                    <span style={HINT}>
                      育休期間のため0円・社会保険料免除に自動設定されます(この画面では変更できません。育休期間の設定を編集してください)
                    </span>
                  )}
                </div>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
