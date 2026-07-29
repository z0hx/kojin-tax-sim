import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { runScenario, compareScenarios, optimizeAcrossYears, type ScenarioOverride } from '../../domain/scenario';
import { selectEligibleYearProfiles } from '../../store/selectors';
import { parseNonNegativeInt, parseOptionalNonNegativeInt } from '../parseAmount';

interface ScenarioForm {
  label: string;
  reinstatementMonth: string; // ''=未指定
  bonusMultiplier: string; // ''=未指定
  additionalMedicalExpense: string; // ''=未指定
  donationAmountOverride: string; // ''=未指定
}

function emptyForm(): ScenarioForm {
  return { label: '', reinstatementMonth: '', bonusMultiplier: '', additionalMedicalExpense: '', donationAmountOverride: '' };
}

/** シナリオ名以外のどの項目が不正だったのかをUIで正確に案内できるよう、成否をタグ付きで返す
 *  (実装後レビュー対応: 以前はどの項目が原因でも「シナリオ名は必須です」から始まる同一の
 *  メッセージになり、シナリオ名を入力済みでも不正解に見える文言になっていた)。 */
type ToOverrideResult = { ok: true; override: ScenarioOverride } | { ok: false; error: string };

function toOverride(form: ScenarioForm): ToOverrideResult {
  if (form.label.trim() === '') return { ok: false, error: 'シナリオ名は必須です。' };
  const override: ScenarioOverride = { label: form.label.trim() };
  if (form.reinstatementMonth !== '') {
    const n = parseNonNegativeInt(form.reinstatementMonth);
    if (n === null || n < 1 || n > 12) return { ok: false, error: '復職月は1〜12の整数で入力してください。' };
    override.reinstatementMonth = n;
  }
  if (form.bonusMultiplier !== '') {
    const n = Number(form.bonusMultiplier);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: '賞与倍率は0以上の数値で入力してください。' };
    override.bonusMultiplier = n;
  }
  if (form.additionalMedicalExpense !== '') {
    const parsed = parseOptionalNonNegativeInt(form.additionalMedicalExpense);
    if (parsed === null || parsed.value === undefined) return { ok: false, error: '追加医療費は0以上の整数で入力してください。' };
    override.additionalMedicalExpense = parsed.value as ScenarioOverride['additionalMedicalExpense'];
  }
  if (form.donationAmountOverride !== '') {
    const parsed = parseOptionalNonNegativeInt(form.donationAmountOverride);
    if (parsed === null || parsed.value === undefined) return { ok: false, error: '寄附額(見込み)は0以上の整数で入力してください。' };
    override.donationAmountOverride = parsed.value as ScenarioOverride['donationAmountOverride'];
  }
  return { ok: true, override };
}

/**
 * S-07 シナリオ比較画面(02仕様書§5、Issue #13、FR-16)。domain/scenario.tsの関数を画面内で
 * 直接呼び出し、比較結果はローカルstateにのみ保持する(03詳細設計書§6.3: storeの主計算結果には
 * 影響させない)。追加したシナリオは画面を離れると失われる(意図的。実績データではなく
 * 「what-if」の一時的な比較用)。
 */
export function ScenarioComparisonScreen() {
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

  const [scenarios, setScenarios] = useState<ScenarioOverride[]>([]);
  const [form, setForm] = useState<ScenarioForm>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);

  if (!profile) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>シナリオ比較</h1>
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
          <h1 style={{ margin: 0 }}>シナリオ比較</h1>
        </div>
        {errorBanner}
        <p style={{ marginTop: '1.5rem' }}>税制パラメータを計算しています…</p>
      </main>
    );
  }

  const variants = scenarios.map((override) => ({ override, result: runScenario(profile, override, params) }));
  const comparisonRows = compareScenarios(calculationResult, variants);

  // FR-22複数年最適化: 税制パラメータが読み込み済みの年度のみを対象にする
  const multiYearProfiles = person ? selectEligibleYearProfiles({ appData, taxParams }, person.id) : [];
  const allocation =
    multiYearProfiles.length >= 2
      ? optimizeAcrossYears({
          profiles: multiYearProfiles,
          paramsByYear: taxParams,
        })
      : null;

  function handleAdd() {
    const result = toOverride(form);
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setFormError(null);
    setScenarios((prev) => [...prev, result.override]);
    setForm(emptyForm());
  }

  function handleRemove(index: number) {
    setScenarios((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>シナリオ比較 ({profile.year}年分)</h1>
      </div>
      {errorBanner}

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>シナリオを追加</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 480 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>シナリオ名</span>
            <input
              type="text"
              aria-label="シナリオ名"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
              style={{ flex: 1 }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>復職月(1〜12)</span>
            <input
              type="text"
              inputMode="numeric"
              aria-label="復職月"
              value={form.reinstatementMonth}
              onChange={(e) => setForm({ ...form, reinstatementMonth: e.target.value })}
              style={{ width: '6rem' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>賞与倍率</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label="賞与倍率"
              value={form.bonusMultiplier}
              onChange={(e) => setForm({ ...form, bonusMultiplier: e.target.value })}
              style={{ width: '6rem' }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>追加医療費</span>
            <input
              className="amount"
              type="text"
              inputMode="numeric"
              aria-label="追加医療費"
              value={form.additionalMedicalExpense}
              onChange={(e) => setForm({ ...form, additionalMedicalExpense: e.target.value })}
              style={{ width: '8rem' }}
            />
            円
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ minWidth: '9rem' }}>寄附額(見込み)</span>
            <input
              className="amount"
              type="text"
              inputMode="numeric"
              aria-label="寄附額(見込み)"
              value={form.donationAmountOverride}
              onChange={(e) => setForm({ ...form, donationAmountOverride: e.target.value })}
              style={{ width: '8rem' }}
            />
            円
          </label>
          {formError && (
            <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem', margin: 0 }}>
              {formError}
            </p>
          )}
          <button type="button" onClick={handleAdd}>
            追加
          </button>
        </div>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>比較結果</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr>
              <th style={thStyle}>シナリオ</th>
              <th style={thStyle}>上限額</th>
              <th style={thStyle}>推奨額</th>
              <th style={thStyle}>自己負担</th>
              <th style={thStyle}>差額(基準比)</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={tdStyle}>基準(現在の入力)</td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <span className="amount">{calculationResult.furusato.limitAmount.toLocaleString()}円</span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <span className="amount">{calculationResult.furusato.recommendedAmount.toLocaleString()}円</span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <span className="amount">{calculationResult.furusato.breakdown.selfBurden.toLocaleString()}円</span>
              </td>
              <td style={{ ...tdStyle, textAlign: 'right' }}>
                <span className="amount">—</span>
              </td>
              <td style={tdStyle} />
            </tr>
            {comparisonRows.map((row, i) => (
              <tr key={`${row.label}-${i}`}>
                <td style={tdStyle}>{row.label}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <span className="amount">{row.limitAmount.toLocaleString()}円</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <span className="amount">{variants[i].result.furusato.recommendedAmount.toLocaleString()}円</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>
                  <span className="amount">{variants[i].result.furusato.breakdown.selfBurden.toLocaleString()}円</span>
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: row.diffFromBase >= 0 ? 'var(--color-fg)' : 'var(--color-danger)' }}>
                  <span className="amount">
                    {row.diffFromBase >= 0 ? '+' : ''}
                    {row.diffFromBase.toLocaleString()}円
                  </span>
                </td>
                <td style={tdStyle}>
                  <button type="button" onClick={() => handleRemove(i)}>
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>複数年配分の最適化(FR-22)</h2>
        {allocation === null ? (
          <p style={{ color: 'var(--color-muted)' }}>
            複数年の配分提案には、税制パラメータを読み込み済みの年度が2年分以上必要です。
          </p>
        ) : (
          <>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr>
                  <th style={thStyle}>年度</th>
                  <th style={thStyle}>上限額</th>
                  <th style={thStyle}>現在の寄附予定額</th>
                  <th style={thStyle}>推奨配分</th>
                </tr>
              </thead>
              <tbody>
                {allocation.years.map((year, i) => (
                  <tr key={year}>
                    <td style={tdStyle}>{year}年分</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <span className="amount">{allocation.perYearLimit[i].toLocaleString()}円</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <span className="amount">{multiYearProfiles[i].furusato.donatedAmount.toLocaleString()}円</span>
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
                      <span className="amount">{allocation.suggestedDonation[i].toLocaleString()}円</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>{allocation.rationale}</p>
          </>
        )}
      </section>
    </main>
  );
}

const thStyle = { textAlign: 'left' as const, padding: '0.4rem 0.8rem', borderBottom: '2px solid var(--color-border)' };
const tdStyle = { padding: '0.4rem 0.8rem', borderBottom: '1px solid var(--color-border)' };
