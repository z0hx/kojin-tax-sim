import type { LifeInsuranceInput } from '../../domain/types';

interface LifeInsuranceFormProps {
  value: LifeInsuranceInput;
  childUnder23CapApplicable: boolean;
  onChange: (value: LifeInsuranceInput) => void;
}

function parseNonNegativeInt(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

function AmountField({ label, amount, onChange }: { label: string; amount: number; onChange: (n: number) => void }) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <span style={{ minWidth: '9rem' }}>{label}</span>
      <input
        className="amount"
        type="text"
        inputMode="numeric"
        aria-label={label}
        value={amount}
        onChange={(e) => {
          const n = parseNonNegativeInt(e.target.value);
          if (n !== null) onChange(n);
        }}
        style={{ width: '8rem' }}
      />
      円
    </label>
  );
}

/**
 * S-03 生命保険料控除欄(02仕様書§3.2.4)。新/旧 × 一般(新のみ介護医療区分あり)/個人年金。
 * hasChildUnder23(令和8年分限定の一般区分上限拡充)は、パラメータテーブルにその年の特例値
 * (`newGeneralChildUnder23Cap`)が定義されているかどうかで有効/無効を切り替える(ハードコードされた
 * 年判定を避け、パラメータ側の変更にUIが追従できるようにするため。Issue #7設計レビュー対応)。
 */
export function LifeInsuranceForm({ value, childUnder23CapApplicable, onChange }: LifeInsuranceFormProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.4rem' }}>新制度</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <AmountField label="新・一般" amount={value.new.general} onChange={(n) => onChange({ ...value, new: { ...value.new, general: n } })} />
          <AmountField label="新・介護医療" amount={value.new.nursing} onChange={(n) => onChange({ ...value, new: { ...value.new, nursing: n } })} />
          <AmountField label="新・個人年金" amount={value.new.pension} onChange={(n) => onChange({ ...value, new: { ...value.new, pension: n } })} />
        </div>
      </div>
      <div>
        <h3 style={{ fontSize: '1rem', margin: '0 0 0.4rem' }}>旧制度</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <AmountField label="旧・一般" amount={value.old.general} onChange={(n) => onChange({ ...value, old: { ...value.old, general: n } })} />
          <AmountField label="旧・個人年金" amount={value.old.pension} onChange={(n) => onChange({ ...value, old: { ...value.old, pension: n } })} />
        </div>
      </div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem' }}>
        <input
          type="checkbox"
          checked={value.hasChildUnder23}
          disabled={!childUnder23CapApplicable}
          onChange={(e) => onChange({ ...value, hasChildUnder23: e.target.checked })}
        />
        23歳未満の扶養親族がいる(新・一般区分の上限拡充の対象)
      </label>
      {!childUnder23CapApplicable && (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted)' }}>この年度は対象外の措置です。</p>
      )}
      {childUnder23CapApplicable && (
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--color-muted)' }}>
          この特例は所得税のみに適用され、住民税の控除額は変わりません。
        </p>
      )}
    </div>
  );
}
