import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { estimateAnnualIncome, monthsInRange, sumNonTaxableBenefits } from '../../domain/income';
import { MonthlyIncomeGrid } from '../components/MonthlyIncomeGrid';
import { LeavePeriodEditor } from '../components/LeavePeriodEditor';
import { BonusEditor } from '../components/BonusEditor';
import { SUPPORTED_TAX_YEARS, latestSupportedTaxYear } from '../../taxParams/supportedYears';

function parseNonNegativeInt(input: string): number | null {
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) return null;
  return n;
}

/**
 * S-02 収入入力画面(02仕様書§5, FR-02〜FR-04)。
 * activeYearがnull(=この人物にまだ年度データが無い)の場合は年度作成のブートストラップ導線を出す。
 * これが救済するのは「人物の初年度作成」のみ。既に年度データを持つ人物の次年度作成(年次ロールオーバー)は
 * ダッシュボードの年度切替UIが担う。
 */
export function IncomeScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const calculationResult = useAppStore((s) => s.calculationResult);
  const updateIncome = useAppStore((s) => s.updateIncome);
  const createBlankYear = useAppStore((s) => s.createBlankYear);
  const requestPersistence = useAppStore((s) => s.requestPersistence);

  // 作成できるのは税制パラメータを収録している年分のみ(Issue #49)。既定値は最新の収録年分
  const [newYear, setNewYear] = useState(latestSupportedTaxYear());
  const [creating, setCreating] = useState(false);

  const person = appData?.persons.find((p) => p.id === activePersonId);
  const profile = person && activeYear !== null ? person.years[activeYear] : undefined;

  async function handleCreateYear() {
    setCreating(true);
    try {
      // 02仕様書§2.4.2: 初回の年度データ保存時にも永続化を要求する(オンボーディング完了時とは別経路)
      await createBlankYear(newYear);
      await requestPersistence();
    } finally {
      setCreating(false);
    }
  }

  if (!profile) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>収入入力</h1>
        </div>
        <p style={{ marginTop: '1.5rem' }}>この人物にはまだ年度データがありません。年度を作成してください。</p>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <label>
            年度
            <select aria-label="年度" value={newYear} onChange={(e) => setNewYear(Number(e.target.value))} style={{ marginLeft: '0.25rem' }}>
              {SUPPORTED_TAX_YEARS.map((y) => (
                <option key={y} value={y}>
                  {y}年分
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={handleCreateYear} disabled={creating}>
            {creating ? '作成中…' : '年度データを作成'}
          </button>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
          過去の年分も選べます(源泉徴収票・住民税決定通知書との検算に使えます)。選べるのは税制パラメータを収録している年分のみです。
        </p>
      </main>
    );
  }

  const income = profile.income;
  const confidenceRatio = calculationResult?.confidenceRatio ?? estimateAnnualIncome(income, { fillMode: 'lastActual' }).confidenceRatio;
  const confidencePercent = Math.round(confidenceRatio * 100);
  const actualMonthCount = income.monthly.filter((m) => m.status === 'actual').length;
  const nonTaxableBenefits = sumNonTaxableBenefits(income);

  function handleFillEstimated() {
    // 育休対象月はどのみち表示上0円固定になるため、見込み埋めの対象から除外し生データを汚さない(M-1対応)
    const exempt = new Set<number>();
    for (const lp of income.leavePeriods) for (const m of monthsInRange(lp.startYm, lp.endYm, profile!.year)) exempt.add(m);
    const { filledIncome } = estimateAnnualIncome(income, { fillMode: 'lastActual' });
    const monthly = filledIncome.monthly.map((m, i) => (exempt.has(m.month) ? income.monthly[i] : m));
    updateIncome({ monthly });
  }

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>収入入力 ({profile.year}年分)</h1>
      </div>

      <section style={{ marginTop: '1.5rem' }}>
        <p style={{ margin: '0 0 0.25rem' }}>
          収入の確定率 {confidencePercent}%（{actualMonthCount}ヶ月が実績）
        </p>
        <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden', maxWidth: 300 }}>
          <div style={{ width: `${confidencePercent}%`, height: '100%', background: '#3366cc' }} />
        </div>
        <button type="button" onClick={handleFillEstimated} style={{ marginTop: '0.5rem' }}>
          見込み月を直近実績月で埋める
        </button>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <label>
          その他給与収入(別の勤務先など、上記に含まれない分)
          <input
            className="amount"
            type="text"
            inputMode="numeric"
            value={income.otherSalaryIncome}
            onChange={(e) => {
              const v = parseNonNegativeInt(e.target.value);
              if (v !== null) updateIncome({ otherSalaryIncome: v });
            }}
            style={{ marginLeft: '0.5rem', width: '10rem' }}
          />
          円
        </label>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>月次収入・社会保険料</h2>
        <MonthlyIncomeGrid
          monthly={income.monthly}
          leavePeriods={income.leavePeriods}
          year={profile.year}
          onChange={(monthly) => updateIncome({ monthly })}
        />
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>育休・産休期間</h2>
        <LeavePeriodEditor
          leavePeriods={income.leavePeriods}
          year={profile.year}
          onChange={(leavePeriods) => updateIncome({ leavePeriods })}
        />
        <p style={{ marginTop: '0.75rem' }}>
          非課税給付合計(育児休業給付金・出産手当金など){' '}
          <span className="amount">{nonTaxableBenefits.toLocaleString()}円</span>
          <br />
          <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            手取り把握のために表示していますが、税計算には含まれません(FR-04)。
          </span>
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2>賞与</h2>
        <BonusEditor bonuses={income.bonuses} leavePeriods={income.leavePeriods} year={profile.year} onChange={(bonuses) => updateIncome({ bonuses })} />
      </section>
    </main>
  );
}
