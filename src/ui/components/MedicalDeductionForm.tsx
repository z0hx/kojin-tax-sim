import { useEffect, useState } from 'react';
import { calcMedicalDeduction } from '../../domain/deductions';
import type { MedicalInput, Yen } from '../../domain/types';
import type { TaxParams } from '../../taxParams/schema';

interface MedicalDeductionFormProps {
  value: MedicalInput;
  totalIncome: Yen;
  params: TaxParams['incomeTax']['medical'];
  oneStopSelected: boolean;
  onChange: (value: MedicalInput) => void;
}

function parseNonNegativeInt(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

const MODE_LABELS: Record<MedicalInput['mode'], string> = {
  auto: '自動(有利な方を採用)',
  medical: '医療費控除',
  selfMedication: 'セルフメディケーション税制',
};

/**
 * S-03 医療費控除欄(02仕様書§3.2.5、FR-06)。
 *
 * paid/reimbursedはローカルの文字列stateにbindし、常にユーザーの入力そのままを表示する。
 * 03詳細設計書§9のVAL-002(補填金額>支払医療費はブロッキングエラー、onChangeタイミング)に従い、
 * 無効な組み合わせのままではonChange(store書き込み)を呼ばない。ただし「直前の有効な値に戻す」
 * 実装(数値を直接controlled bindする方式)だと、(a) 桁を1桁ずつ入力する途中で一時的に他方を
 * 超える中間状態を通るとその場でキー入力が反映されなくなったように見える、(b) インポート等で
 * 既に不整合なデータが保存されている場合にどちらのフィールドを編集しても是正できなくなる、
 * という2つの欠陥を生む(設計レビューで指摘)。ローカル文字列stateなら入力自体は常に画面に
 * 反映され、かつ「編集後の組み合わせ」で検証するため、不整合な既存値からでも
 * 有効な組み合わせに達した時点で自動的にコミットされ是正できる。
 */
export function MedicalDeductionForm({ value, totalIncome, params, oneStopSelected, onChange }: MedicalDeductionFormProps) {
  const [paidText, setPaidText] = useState(String(value.paid));
  const [reimbursedText, setReimbursedText] = useState(String(value.reimbursed));
  const [selfMedicationText, setSelfMedicationText] = useState(String(value.selfMedication));
  const [error, setError] = useState<string | null>(null);

  // 人物/年度切替・インポート適用など外部要因でvalueが変わった場合にローカル表示を追従させる。
  // 自分自身のonChangeの結果としてvalueが変わった場合は、テキストと数値が既に一致しているため無害。
  useEffect(() => setPaidText(String(value.paid)), [value.paid]);
  useEffect(() => setReimbursedText(String(value.reimbursed)), [value.reimbursed]);
  useEffect(() => setSelfMedicationText(String(value.selfMedication)), [value.selfMedication]);

  function commitPaidOrReimbursed(candidate: { paid: number; reimbursed: number }) {
    if (candidate.reimbursed > candidate.paid) {
      setError('補填金額が支払医療費を超えています。どちらかの金額を見直してください');
      return;
    }
    setError(null);
    onChange({ ...value, paid: candidate.paid, reimbursed: candidate.reimbursed });
  }

  function handlePaidChange(text: string) {
    setPaidText(text);
    const n = parseNonNegativeInt(text);
    if (n === null) {
      setError('支払医療費は0以上の整数で入力してください');
      return;
    }
    commitPaidOrReimbursed({ paid: n, reimbursed: value.reimbursed });
  }

  function handleReimbursedChange(text: string) {
    setReimbursedText(text);
    const n = parseNonNegativeInt(text);
    if (n === null) {
      setError('補填金額は0以上の整数で入力してください');
      return;
    }
    commitPaidOrReimbursed({ paid: value.paid, reimbursed: n });
  }

  function handleSelfMedicationChange(text: string) {
    setSelfMedicationText(text);
    const n = parseNonNegativeInt(text);
    if (n === null) {
      setError('セルフメディケーション対象額は0以上の整数で入力してください');
      return;
    }
    setError(null);
    onChange({ ...value, selfMedication: n });
  }

  const result = calcMedicalDeduction(value, totalIncome, params);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ minWidth: '9rem' }}>支払医療費</span>
        <input
          className="amount"
          type="text"
          inputMode="numeric"
          aria-label="支払医療費"
          value={paidText}
          onChange={(e) => handlePaidChange(e.target.value)}
          style={{ width: '8rem' }}
        />
        円
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ minWidth: '9rem' }}>補填金額</span>
        <input
          className="amount"
          type="text"
          inputMode="numeric"
          aria-label="補填金額"
          value={reimbursedText}
          onChange={(e) => handleReimbursedChange(e.target.value)}
          style={{ width: '8rem' }}
        />
        円
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ minWidth: '9rem' }}>セルフメディケーション対象額</span>
        <input
          className="amount"
          type="text"
          inputMode="numeric"
          aria-label="セルフメディケーション対象額"
          value={selfMedicationText}
          onChange={(e) => handleSelfMedicationChange(e.target.value)}
          style={{ width: '8rem' }}
        />
        円
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <span style={{ minWidth: '9rem' }}>方式</span>
        <select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as MedicalInput['mode'] })}>
          {(Object.entries(MODE_LABELS) as [MedicalInput['mode'], string][]).map(([mode, label]) => (
            <option key={mode} value={mode}>
              {label}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem', margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ background: 'var(--color-selected-bg)', borderRadius: 6, padding: '0.6rem 0.8rem', marginTop: '0.4rem' }}>
        <p style={{ margin: 0 }}>
          足切り額: <span className="amount">{result.thresholdUsed.toLocaleString()}円</span>{' '}
          <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            ({result.thresholdBasis === 'incomeRatio5pct' ? '総所得金額等×5%が10万円を下回るため採用' : '定額10万円を採用'})
          </span>
        </p>
        <p style={{ margin: '0.3rem 0 0' }}>
          採用方式: {MODE_LABELS[result.chosenMode]}
          {value.mode === 'auto' && <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>(自動判定で有利な方を採用)</span>}
        </p>
        <p style={{ margin: '0.3rem 0 0' }}>
          控除額: <span className="amount">{result.amount.toLocaleString()}円</span>{' '}
          <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            (参考: セルフメディケーション税制なら{result.selfMedicationAmount.toLocaleString()}円)
          </span>
        </p>
      </div>

      {oneStopSelected && value.paid > 0 && (
        <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem', margin: 0 }}>
          医療費控除があるためワンストップ特例は利用できません(確定申告が必要です)。
        </p>
      )}
    </div>
  );
}
