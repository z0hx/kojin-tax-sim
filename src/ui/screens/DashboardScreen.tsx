import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { WarningBannerList } from '../components/WarningBannerList';
import { PrintButton } from '../components/PrintButton';
import { daysSince } from '../dateUtils';
import { compareWithActuals } from '../../domain/actuals';

/** 西暦年から令和年へ変換する(令和1年=2019年)。02仕様書§5 S-01モックアップの表示形式に合わせる */
function toReiwaYear(year: number): number {
  return year - 2018;
}

/**
 * S-01 ダッシュボード画面(02仕様書§5、Issue #9)。本アプリの中核課題である
 * 「今年の上限額が分からない」に応える最初の画面。App.tsx上は既定画面('main')として表示する。
 *
 * FR-28(バックアップ督促)はIssue #5(S-09データ管理画面)でS-09内には実装済みだが、S-01(本画面)への
 * 表示は本Issueで初めて行う(Issue #9への申し送り事項対応)。S-09と同一条件(lastExportedAtがnull、
 * または30日以上経過)で判定する。
 *
 * 年度切替は「既存年度への切替」と「次年度(最新年度+1)の追加」のみを提供する。任意の年度番号を
 * 直接指定するUIは設けない(Issue #6への申し送り事項: createBlankYearは既存年度を無条件上書きする
 * ため、UIから呼ぶ場合は対象年度が未作成であることを保証する必要がある。「常に最新+1のみ追加可能」
 * という制約により、既存年度を誤って上書きする経路自体が存在しなくなる)。
 */
export function DashboardScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const calculationResult = useAppStore((s) => s.calculationResult);
  const taxParams = useAppStore((s) => s.taxParams);
  const setActiveYear = useAppStore((s) => s.setActiveYear);
  const copyYearFromPrevious = useAppStore((s) => s.copyYearFromPrevious);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);
  // 「次年度を追加」ボタンの二重送信防止(実装後レビュー対応: IncomeScreenの年度作成ボタンと同様、
  // 非同期処理(copyYearFromPrevious)の完了前に連打されると同じ年度への上書き複製が重複実行されうる)。
  const [addingYear, setAddingYear] = useState(false);

  const person = appData?.persons.find((p) => p.id === activePersonId);
  const profile = person && activeYear !== null ? person.years[activeYear] : undefined;

  if (!person) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <p>人物が登録されていません。</p>
      </main>
    );
  }

  const years = Object.keys(person.years)
    .map(Number)
    .sort((a, b) => a - b);
  const nextYear = years.length > 0 ? Math.max(...years) + 1 : new Date().getFullYear();

  if (!profile) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <h1>TaxSim</h1>
        <p>この人物にはまだ年度データがありません。まず収入入力画面で年度を作成してください。</p>
        <button type="button" onClick={() => navigate('income')}>
          収入入力へ
        </button>
      </main>
    );
  }

  const params = taxParams[profile.year];

  // lastErrorは税制パラメータの読み込み失敗等でセットされうる。他画面(HousingLoanScreen等)と同様、
  // バナーとして表示する(実装後レビュー対応: 読み込み失敗時に「計算しています…」の空スピナーが
  // 永続表示されるだけでは、ユーザーが原因も対処法も分からない)。
  const errorBanner = lastError && (
    <div
      role="alert"
      style={{ marginTop: '1rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem', borderRadius: 4, fontSize: '0.85rem' }}
    >
      {lastError.message}
      <button className="no-print" type="button" onClick={clearLastError} style={{ marginLeft: '0.5rem' }}>
        閉じる
      </button>
    </div>
  );

  if (!calculationResult || !params) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <h1>TaxSim</h1>
        {errorBanner}
        <p>税制パラメータを計算しています…</p>
      </main>
    );
  }

  const lastExportedAt = appData?.appSettings.lastExportedAt ?? null;
  const backupOverdue = lastExportedAt === null || daysSince(lastExportedAt) >= 30;
  // 検算未達バナー(FR-17、03詳細設計書§3.10): 実績値が入力済みで誤差±1%を超える項目がある間、
  // 02仕様書§7.3の運用ルール(本アプリの出力を意思決定に使わない)をダッシュボードに常時表示する。
  const actualsCheck = profile.actuals ? compareWithActuals(calculationResult, profile.actuals) : null;
  const actualsMismatch = actualsCheck !== null && !actualsCheck.withinTolerance;

  const { furusato, warnings, income } = calculationResult;
  const remaining = Math.max(0, furusato.limitAmount - profile.furusato.donatedAmount);

  const confidenceRatio = calculationResult.confidenceRatio;
  const confidencePercent = Math.round(confidenceRatio * 100);
  const actualMonthCount = profile.income.monthly.filter((m) => m.status === 'actual').length;

  // 4区分の合計は寄附額(上限額)と一致する(engine.ts参照)。1本の積み上げ棒として表示するため、
  // 1行に4区分すべての値を持たせる(区分ごとに行を分けるとBarのstackIdによる積み上げにならない)。
  const breakdownData = [
    {
      name: '内訳',
      自己負担: furusato.breakdown.selfBurden,
      所得税軽減: furusato.breakdown.incomeTaxReduction,
      住民税基本分: furusato.breakdown.residentBasic,
      住民税特例分: furusato.breakdown.residentSpecial,
    },
  ];

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>
          {person.displayName} {profile.year}年分(令和{toReiwaYear(profile.year)}年分)
        </h1>
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label>
            年度切替{' '}
            <select
              aria-label="年度切替"
              value={profile.year}
              onChange={(e) => void setActiveYear(Number(e.target.value))}
            >
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}年分
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={addingYear}
            onClick={async () => {
              setAddingYear(true);
              try {
                await copyYearFromPrevious(nextYear);
              } finally {
                setAddingYear(false);
              }
            }}
          >
            {nextYear}年分を追加
          </button>
          <PrintButton />
        </div>
      </div>

      {errorBanner}

      {actualsMismatch && (
        <p
          role="alert"
          style={{ marginTop: '1rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem 0.8rem', borderRadius: 6 }}
        >
          ⚠ 検算(実績値との突合)で誤差±1%を超える項目があります。本アプリの出力を実際の申告・納税の意思決定に使用しないでください。{' '}
          <button className="no-print" type="button" onClick={() => navigate('actuals')}>
            検算画面で確認
          </button>
        </p>
      )}

      {backupOverdue && (
        <p
          role="alert"
          style={{ marginTop: '1rem', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', padding: '0.5rem 0.8rem', borderRadius: 6 }}
        >
          ⚠{' '}
          {lastExportedAt === null
            ? 'まだバックアップ(エクスポート)をしていません。'
            : `最終エクスポートから${daysSince(lastExportedAt)}日経過しています。`}{' '}
          データ管理画面からエクスポートをおすすめします。
        </p>
      )}

      <section style={{ marginTop: '1.5rem' }}>
        <p style={{ margin: '0.2rem 0' }}>
          ふるさと納税 上限額 <span className="amount" style={{ fontSize: '1.1rem' }}>{furusato.limitAmount.toLocaleString()}円</span>
        </p>
        <p style={{ margin: '0.2rem 0', fontSize: '1.4rem', fontWeight: 700 }}>
          推奨額(安全率適用後) <span className="amount">{furusato.recommendedAmount.toLocaleString()}円</span>
        </p>
        <p style={{ margin: '0.2rem 0' }}>
          寄附済み <span className="amount">{profile.furusato.donatedAmount.toLocaleString()}円</span>
        </p>
        <p style={{ margin: '0.2rem 0' }}>
          残り <span className="amount">{remaining.toLocaleString()}円</span>
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>警告</h2>
        <WarningBannerList warnings={warnings} />
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <p style={{ margin: '0 0 0.25rem' }}>
          収入の確定率 {confidencePercent}%({actualMonthCount}ヶ月が実績)
        </p>
        <div style={{ height: 8, background: 'var(--color-border)', borderRadius: 4, overflow: 'hidden', maxWidth: 300 }}>
          <div style={{ width: `${confidencePercent}%`, height: '100%', background: 'var(--color-series-1)' }} />
        </div>
        {income.nonTaxableBenefits > 0 && (
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            (非課税給付 {income.nonTaxableBenefits.toLocaleString()}円は税計算に含まれません)
          </p>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>内訳</h2>
        <div style={{ width: '100%', height: 120 }}>
          <ResponsiveContainer>
            <BarChart data={breakdownData} layout="vertical" margin={{ left: 24 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={100} />
              <Tooltip formatter={(value) => `${Number(value).toLocaleString()}円`} />
              <Bar dataKey="自己負担" stackId="a" fill="var(--color-series-1)" />
              <Bar dataKey="所得税軽減" stackId="a" fill="var(--color-series-2)" />
              <Bar dataKey="住民税基本分" stackId="a" fill="var(--color-series-3)" />
              <Bar dataKey="住民税特例分" stackId="a" fill="var(--color-series-4)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}
