import type { CSSProperties } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import type { TraceStep } from '../../domain/types';

const PERCENT_KEYS = new Set(['marginalRate']);
const BOOLEAN_KEYS = new Set(['residentIncomeNonTaxable', 'residentPerCapitaNonTaxable']);

/** trace各行の値を項目の性質に応じて表示形式を変える(円・%・適用有無)。02仕様書§1.4.6:
 *  金額は等幅数字(.amount)で桁を揃える。 */
function formatTraceValue(step: TraceStep): string {
  if (PERCENT_KEYS.has(step.key)) return `${(step.value * 100).toFixed(0)}%`;
  if (BOOLEAN_KEYS.has(step.key)) return step.value === 1 ? '適用' : '非適用';
  return `${step.value.toLocaleString()}円`;
}

/**
 * S-05 計算明細画面(02仕様書§5、Issue #10)。FR-18(根拠の開示)に応え、
 * CalculationResult.traceを表形式で全開示する。「なぜこの上限になったか」を追跡できることが完了条件。
 */
export function CalculationDetailScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const calculationResult = useAppStore((s) => s.calculationResult);
  const taxParams = useAppStore((s) => s.taxParams);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);

  const person = appData?.persons.find((p) => p.id === activePersonId);
  const profile = person && activeYear !== null ? person.years[activeYear] : undefined;

  if (!profile) {
    return (
      <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>計算明細</h1>
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
      <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>計算明細</h1>
        </div>
        {errorBanner}
        <p style={{ marginTop: '1.5rem' }}>税制パラメータを計算しています…</p>
      </main>
    );
  }

  const modeDiff = (calculationResult.furusato.limitAmount - calculationResult.furusatoConservative.limitAmount) as number;

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>計算明細 ({profile.year}年分)</h1>
      </div>
      {errorBanner}

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>ふるさと納税上限額の解釈による振れ幅(02仕様書§4.3)</h2>
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>モード</th>
              <th style={thStyle}>上限額</th>
              <th style={thStyle}>推奨額(安全率適用後)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>標準(20%枠の基準: 調整控除後・税額控除前の所得割額)</td>
              <td style={tdStyle}>
                <span className="amount">{calculationResult.furusato.limitAmount.toLocaleString()}円</span>
              </td>
              <td style={tdStyle}>
                <span className="amount">{calculationResult.furusato.recommendedAmount.toLocaleString()}円</span>
              </td>
            </tr>
            <tr>
              <td style={tdStyle}>保守的(20%枠の基準: 住宅ローン控除適用後の所得割額)</td>
              <td style={tdStyle}>
                <span className="amount">{calculationResult.furusatoConservative.limitAmount.toLocaleString()}円</span>
              </td>
              <td style={tdStyle}>
                <span className="amount">{calculationResult.furusatoConservative.recommendedAmount.toLocaleString()}円</span>
              </td>
            </tr>
          </tbody>
        </table>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
          差額(解釈による振れ幅): <span className="amount">{modeDiff.toLocaleString()}円</span>
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>計算過程(全ステップ開示、FR-18)</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={thStyle}>項目名</th>
              <th style={thStyle}>金額</th>
              <th style={thStyle}>計算式</th>
              <th style={thStyle}>根拠</th>
            </tr>
          </thead>
          <tbody>
            {calculationResult.trace.map((step) => (
              <tr key={step.key}>
                <td style={tdStyle}>{step.label}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <span className="amount">{formatTraceValue(step)}</span>
                </td>
                <td style={{ ...tdStyle, color: 'var(--color-muted)', fontSize: '0.85rem' }}>{step.formula ?? '—'}</td>
                <td style={{ ...tdStyle, color: 'var(--color-muted)', fontSize: '0.85rem' }}>{step.refs?.join(', ') ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

const thStyle: CSSProperties = { textAlign: 'left', padding: '0.4rem 0.8rem', borderBottom: '2px solid var(--color-border)' };
const tdStyle: CSSProperties = { padding: '0.4rem 0.8rem', borderBottom: '1px solid var(--color-border)' };
