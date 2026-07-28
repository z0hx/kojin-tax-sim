import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { compareWithActuals, TOLERANCE_PCT } from '../../domain/actuals';
import type { ActualValues } from '../../domain/types';
import { parseOptionalNonNegativeInt } from '../parseAmount';

const SOURCE_LABELS: Record<ActualValues['source'], string> = {
  withholding: '源泉徴収票',
  residentTaxNotice: '住民税決定通知書',
  taxReturn: '確定申告書(控え)',
};

interface FieldSpec {
  key: 'incomeTaxTotal' | 'residentIncomeLevy' | 'residentPerCapita' | 'housingLoanUsedIncomeTax' | 'housingLoanUsedResident';
  label: string;
  hint: string;
}

const FIELDS: FieldSpec[] = [
  { key: 'incomeTaxTotal', label: '源泉徴収税額', hint: '源泉徴収票の「源泉徴収税額」' },
  { key: 'residentIncomeLevy', label: '住民税所得割額', hint: '住民税決定通知書の「所得割額」' },
  { key: 'residentPerCapita', label: '住民税均等割額', hint: '住民税決定通知書の「均等割額」' },
  { key: 'housingLoanUsedIncomeTax', label: '住宅ローン控除(所得税)', hint: '源泉徴収票の「住宅借入金等特別控除の額」' },
  { key: 'housingLoanUsedResident', label: '住宅ローン控除(住民税)', hint: '住民税決定通知書「摘要」欄の住宅ローン控除額' },
];

/**
 * 検算モード画面(FR-17、03詳細設計書§3.10)。源泉徴収票・住民税決定通知書の実績値を入力し、
 * 計算エンジンの出力(CalculationResult)と突き合わせる。
 *
 * 完了条件のうちT-17(実データでの±1%以内の突合)は、この画面を使ってユーザー自身が
 * 自分の源泉徴収票・住民税決定通知書の実額をローカルで入力して検証するものであり、
 * 実額そのものをこのリポジトリ(テストコード等)にコミットすることはしない
 * (本アプリはpublicリポジトリであり、実在の所得情報を含めるべきではないため)。
 * 入力された実績値はIndexedDBにのみ保存され、外部送信されない(NFR-01と同じ前提)。
 */
export function ActualsScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const calculationResult = useAppStore((s) => s.calculationResult);
  const taxParams = useAppStore((s) => s.taxParams);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);
  const updateActuals = useAppStore((s) => s.updateActuals);

  const person = appData?.persons.find((p) => p.id === activePersonId);
  const profile = person && activeYear !== null ? person.years[activeYear] : undefined;

  if (!profile) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>検算</h1>
        </div>
        <p style={{ marginTop: '1.5rem' }}>この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。</p>
        <button type="button" onClick={() => navigate('income')}>
          収入入力へ
        </button>
      </main>
    );
  }

  const params = taxParams[profile.year];

  const errorBanner = lastError && (
    <div
      role="alert"
      style={{ marginTop: '1rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem', borderRadius: 4, fontSize: '0.85rem' }}
    >
      {lastError.message}
      <button type="button" onClick={clearLastError} style={{ marginLeft: '0.5rem' }}>
        閉じる
      </button>
    </div>
  );

  if (!calculationResult || !params) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>検算</h1>
        </div>
        {errorBanner}
        <p style={{ marginTop: '1.5rem' }}>税制パラメータを計算しています…</p>
      </main>
    );
  }

  const actuals = profile.actuals;
  const { items, withinTolerance } = actuals ? compareWithActuals(calculationResult, actuals) : { items: [], withinTolerance: true };

  function updateField(key: FieldSpec['key'], text: string) {
    const parsed = parseOptionalNonNegativeInt(text);
    if (parsed === null) return;
    const base: ActualValues = actuals ?? { source: 'withholding' };
    updateActuals({ ...base, [key]: parsed.value });
  }

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>検算 ({profile.year}年分)</h1>
      </div>
      {errorBanner}

      <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
        源泉徴収票・住民税決定通知書の実額を入力すると、本アプリの計算結果と突き合わせられます。入力した実額はこの端末に保存されるのみで、外部には送信されません。
        誤差が±1%を超える項目がある間は、本アプリの出力を実際の申告・納税の意思決定に使用しないでください。
      </p>

      <section style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ minWidth: '9rem' }}>実績書類の種類</span>
          <select
            aria-label="実績書類の種類"
            value={actuals?.source ?? 'withholding'}
            onChange={(e) => updateActuals({ ...(actuals ?? { source: 'withholding' }), source: e.target.value as ActualValues['source'] })}
          >
            {(Object.entries(SOURCE_LABELS) as [ActualValues['source'], string][]).map(([source, label]) => (
              <option key={source} value={source}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.75rem' }}>
          {FIELDS.map((field) => (
            <label key={field.key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ minWidth: '12rem' }}>
                {field.label}
                <br />
                <span style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{field.hint}</span>
              </span>
              <input
                className="amount"
                type="text"
                inputMode="numeric"
                aria-label={field.label}
                value={actuals?.[field.key] ?? ''}
                onChange={(e) => updateField(field.key, e.target.value)}
                style={{ width: '8rem' }}
              />
              円
            </label>
          ))}
        </div>

        {actuals && (
          <button type="button" style={{ marginTop: '0.75rem' }} onClick={() => updateActuals(null)}>
            実績値の入力をすべて取り消す
          </button>
        )}
      </section>

      {items.length > 0 && (
        <section style={{ marginTop: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem' }}>突合結果</h2>
          {!withinTolerance && (
            <p
              role="alert"
              style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem 0.8rem', borderRadius: 6 }}
            >
              ⚠ 誤差が±1%を超える項目があります。本アプリの出力を意思決定に使用しないでください。
            </p>
          )}
          {withinTolerance && (
            <p style={{ color: 'var(--color-fg)' }}>すべての項目が誤差±1%以内で一致しています。</p>
          )}
          <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '0.5rem' }}>
            <thead>
              <tr>
                <th style={thStyle}>項目</th>
                <th style={thStyle}>計算値</th>
                <th style={thStyle}>実績値</th>
                <th style={thStyle}>差分</th>
                <th style={thStyle}>差分(%)</th>
                <th style={thStyle}>判定</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.label}>
                  <td style={tdStyle}>{item.label}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{item.calculated.toLocaleString()}円</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{item.actual.toLocaleString()}円</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{item.diffAbs.toLocaleString()}円</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{Number.isFinite(item.diffPct) ? `${item.diffPct.toFixed(2)}%` : '—'}</span>
                  </td>
                  <td style={{ ...tdStyle, color: item.diffPct <= TOLERANCE_PCT ? 'var(--color-fg)' : 'var(--color-danger)' }}>
                    {item.diffPct <= TOLERANCE_PCT ? '一致' : '要確認'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

const thStyle = { textAlign: 'left' as const, padding: '0.4rem 0.8rem', borderBottom: '2px solid var(--color-border)' };
const tdStyle = { padding: '0.4rem 0.8rem', borderBottom: '1px solid var(--color-border)' };
