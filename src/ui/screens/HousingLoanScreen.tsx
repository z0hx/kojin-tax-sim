import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { calcResidentTaxCapDetail } from '../../domain/housingLoan';
import { HousingLoanForm } from '../components/HousingLoanForm';
import { HousingLoanBreakdown } from '../components/HousingLoanBreakdown';

/**
 * S-04 住宅ローン控除 入力・可視化画面(02仕様書§5 S-04、Issue #8)。
 * 完了条件: 切り捨て損失が金額として可視化されること。実際のW-01〜W-03警告表示はIssue #9(ダッシュボード・
 * 警告エンジン結線)の範囲であり、本画面はその判定に使う値(taxAfterCredits/wasted等)を
 * calculationResultとして既に露出している状態にとどめる。
 */
export function HousingLoanScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const calculationResult = useAppStore((s) => s.calculationResult);
  const taxParams = useAppStore((s) => s.taxParams);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);
  const updateHousingLoan = useAppStore((s) => s.updateHousingLoan);

  const person = appData?.persons.find((p) => p.id === activePersonId);
  const profile = person && activeYear !== null ? person.years[activeYear] : undefined;

  if (!profile) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>住宅ローン控除</h1>
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
          <h1 style={{ margin: 0 }}>住宅ローン控除</h1>
        </div>
        {errorBanner}
        <p style={{ marginTop: '1.5rem' }}>税制パラメータを計算しています…</p>
      </main>
    );
  }

  const previousYearBalance = person?.years[profile.year - 1]?.housingLoan?.yearEndBalance;
  const capDetail = calcResidentTaxCapDetail(
    calculationResult.residentTax.taxableIncome,
    profile.housingLoan?.residentTaxCapRule,
    params.residentTax.housingLoanCapRules
  );

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>住宅ローン控除 ({profile.year}年分)</h1>
      </div>
      {errorBanner}

      <section style={{ marginTop: '1.5rem' }}>
        {/* key={人物+年度}: HousingLoanFormは控除率欄にローカルstate(入力途中のテキストバッファ)を持つ。
            人物/年度切替時は同一コンポーネントインスタンスのまま value プロップだけが差し替わるため、
            バッファの再同期がvalue.rateの数値一致判定に依存していると、たまたま同じ控除率の
            別レコードへ切り替わった際に古いバッファが残ってしまう(レビュー3巡目是正)。
            keyを変えて強制的に再マウントし、ローカルstateを確実にリセットする。 */}
        <HousingLoanForm
          key={`${activePersonId}-${profile.year}`}
          value={profile.housingLoan}
          year={profile.year}
          previousYearBalance={previousYearBalance}
          onChange={updateHousingLoan}
        />
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>控除の流れ</h2>
        <HousingLoanBreakdown housingLoan={calculationResult.housingLoan} capDetail={capDetail} />
      </section>
    </main>
  );
}
