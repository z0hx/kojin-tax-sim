import { useState } from 'react';
import { monthsInRange } from '../../domain/income';
import type { LeavePeriod } from '../../domain/types';

interface LeavePeriodEditorProps {
  leavePeriods: LeavePeriod[];
  year: number;
  onChange: (leavePeriods: LeavePeriod[]) => void;
}

const TYPE_LABELS: Record<LeavePeriod['type'], string> = {
  childcare: '育児休業',
  maternity: '産前産後休業',
  other: 'その他休業',
};

function ym(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function monthSet(period: Pick<LeavePeriod, 'startYm' | 'endYm'>, year: number): Set<number> {
  return new Set(monthsInRange(period.startYm, period.endYm, year));
}

/** 新しい期間が既存のいずれかの期間と対象月で重複するか(非課税給付の二重計上防止, M-3対応) */
function overlapsExisting(candidate: { startYm: string; endYm: string }, existing: LeavePeriod[], year: number): LeavePeriod | null {
  const candidateMonths = monthSet(candidate, year);
  for (const period of existing) {
    const existingMonths = monthSet(period, year);
    for (const m of candidateMonths) {
      if (existingMonths.has(m)) return period;
    }
  }
  return null;
}

/** 既に保存されている期間同士が重複していないか(インポート等で重複データが混入したケースの検知用) */
function findOverlapAmongExisting(periods: LeavePeriod[], year: number): [LeavePeriod, LeavePeriod] | null {
  for (let i = 0; i < periods.length; i++) {
    for (let j = i + 1; j < periods.length; j++) {
      if (overlapsExisting(periods[i], [periods[j]], year)) return [periods[i], periods[j]];
    }
  }
  return null;
}

/**
 * S-02 育休・産休期間エディタ(02仕様書§5)。
 * ドラッグでの月範囲選択に加え、プルダウンによる非ドラッグの追加手段を必ず併設する(M-5対応、アクセシビリティ確保)。
 * ドラッグ操作はプルダウンの値を更新するだけで、実際の保存は共通の「追加」ボタン操作を通す。
 */
export function LeavePeriodEditor({ leavePeriods, year, onChange }: LeavePeriodEditorProps) {
  const [type, setType] = useState<LeavePeriod['type']>('childcare');
  const [startMonth, setStartMonth] = useState(1);
  const [endMonth, setEndMonth] = useState(1);
  const [benefitAmount, setBenefitAmount] = useState('0');
  const [dragStart, setDragStart] = useState<number | null>(null);
  const [dragEnd, setDragEnd] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dragging = dragStart !== null;
  const dragLo = dragging ? Math.min(dragStart!, dragEnd ?? dragStart!) : null;
  const dragHi = dragging ? Math.max(dragStart!, dragEnd ?? dragStart!) : null;

  function commitDrag() {
    if (dragStart === null) return;
    const lo = Math.min(dragStart, dragEnd ?? dragStart);
    const hi = Math.max(dragStart, dragEnd ?? dragStart);
    setStartMonth(lo);
    setEndMonth(hi);
    setDragStart(null);
    setDragEnd(null);
  }

  function handleAdd() {
    setError(null);
    const lo = Math.min(startMonth, endMonth);
    const hi = Math.max(startMonth, endMonth);
    const amount = Number(benefitAmount);
    if (!Number.isFinite(amount) || amount < 0 || !Number.isInteger(amount)) {
      setError('給付金額は0以上の整数で入力してください');
      return;
    }
    const candidate = { startYm: ym(year, lo), endYm: ym(year, hi) };
    const conflict = overlapsExisting(candidate, leavePeriods, year);
    if (conflict) {
      setError(`既存の期間(${TYPE_LABELS[conflict.type]} ${conflict.startYm}〜${conflict.endYm})と重複しています。先に編集または削除してください`);
      return;
    }
    const newPeriod: LeavePeriod = { type, startYm: candidate.startYm, endYm: candidate.endYm, benefitAmount: amount };
    onChange([...leavePeriods, newPeriod]);
    setBenefitAmount('0');
  }

  function handleRemove(index: number) {
    onChange(leavePeriods.filter((_, i) => i !== index));
  }

  const existingConflict = findOverlapAmongExisting(leavePeriods, year);

  return (
    <div>
      {existingConflict && (
        <div role="alert" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem', borderRadius: 4, marginBottom: '0.75rem' }}>
          登録済みの育休・産休期間のうち2件が月をまたいで重複しています(
          {existingConflict[0].startYm}〜{existingConflict[0].endYm} と {existingConflict[1].startYm}〜{existingConflict[1].endYm})。
          非課税給付が二重計上される可能性があるため、どちらかを編集・削除してください。
        </div>
      )}

      <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
        下のバーをドラッグして期間を選ぶか、プルダウンで開始月・終了月を選んでください。
      </p>
      <div
        role="group"
        aria-label="育休期間の月選択バー"
        style={{ display: 'flex', gap: 2, marginBottom: '0.5rem', userSelect: 'none' }}
        onMouseUp={commitDrag}
        onMouseLeave={() => dragging && commitDrag()}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
          const selected = dragging ? m >= dragLo! && m <= dragHi! : m >= Math.min(startMonth, endMonth) && m <= Math.max(startMonth, endMonth);
          return (
            <div
              key={m}
              data-testid={`leave-drag-cell-${m}`}
              onMouseDown={() => {
                setDragStart(m);
                setDragEnd(m);
              }}
              onMouseEnter={() => dragging && setDragEnd(m)}
              style={{
                flex: 1,
                textAlign: 'center',
                padding: '0.4rem 0',
                fontSize: '0.75rem',
                border: '1px solid var(--color-border)',
                borderRadius: 4,
                background: selected ? 'var(--color-selected-bg)' : 'transparent',
                cursor: 'pointer',
              }}
            >
              {m}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          種別
          <select value={type} onChange={(e) => setType(e.target.value as LeavePeriod['type'])} style={{ marginLeft: '0.25rem' }}>
            {Object.entries(TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          開始月
          <select value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))} style={{ marginLeft: '0.25rem' }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </label>
        <label>
          終了月
          <select value={endMonth} onChange={(e) => setEndMonth(Number(e.target.value))} style={{ marginLeft: '0.25rem' }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {m}月
              </option>
            ))}
          </select>
        </label>
        <label>
          給付金額(円)
          <input
            className="amount"
            type="text"
            inputMode="numeric"
            value={benefitAmount}
            onChange={(e) => setBenefitAmount(e.target.value)}
            style={{ marginLeft: '0.25rem', width: '8rem' }}
          />
        </label>
        <button type="button" onClick={handleAdd}>
          追加
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>
          {error}
        </p>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>種別</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>開始</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>終了</th>
            <th style={{ textAlign: 'left', padding: '0.25rem 0.5rem' }}>給付金額</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {leavePeriods.map((p, i) => (
            <tr key={`${p.startYm}-${p.endYm}-${i}`} style={{ borderTop: '1px solid var(--color-border)' }}>
              <td style={{ padding: '0.25rem 0.5rem' }}>{TYPE_LABELS[p.type]}</td>
              <td style={{ padding: '0.25rem 0.5rem' }}>{p.startYm}</td>
              <td style={{ padding: '0.25rem 0.5rem' }}>{p.endYm}</td>
              <td className="amount" style={{ padding: '0.25rem 0.5rem' }}>
                {p.benefitAmount.toLocaleString()}円
              </td>
              <td style={{ padding: '0.25rem 0.5rem' }}>
                <button type="button" onClick={() => handleRemove(i)}>
                  削除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
