import { useEffect, useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ReferenceDot, ResponsiveContainer } from 'recharts';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { selfBurden } from '../../domain/furusato';
import type { YearProfile, Yen } from '../../domain/types';
import type { TaxParams } from '../../taxParams/schema';
import { buildSelfBurdenCurve, CURVE_STEP_MIN } from '../selfBurdenCurve';

/**
 * S-06 シミュレーション画面(02仕様書§5、Issue #11、FR-12)。
 * 寄附額スライダーで自己負担額の変化をリアルタイムに確認できる。スライダーはprofile.furusato.donatedAmount
 * (実績値)を書き換えない、ローカルな「what-if」探索用の状態として扱う(実績の上書きを避けるため)。
 */
export function SimulationScreen() {
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
  const params = profile ? taxParams[profile.year] : undefined;
  const limitAmount = calculationResult?.furusato.limitAmount ?? 0;
  // 上限を超えた領域(傾き1で自己負担が増える様子)も含めて見えるよう、上限より十分先まで範囲を取る
  const maxDonation = Math.max(limitAmount * 1.5, limitAmount + 20_000, 50_000);

  const [donation, setDonation] = useState<number | null>(null);
  // 人物・年度を切り替えたら探索用のローカル値を破棄し、実績値(donatedAmount)の表示に戻す
  // (実装後レビュー対応: ヘッダーの人物切替はこの画面をアンマウントしないため、切替後も前の
  // 人物のスライダー値が残ってしまっていた)。
  useEffect(() => setDonation(null), [activePersonId, activeYear]);
  // ネイティブ<input type=range>はvalueをmaxへ自動的にクランプするが、donationValueをクランプせずに
  // 表示・ReferenceDotへ渡すと、実績値(donatedAmount)がmaxDonationを超えるケースでスライダーの
  // つまみと表示・グラフ上の点がずれる(実装後レビュー対応)。
  const donationValue = Math.min(donation ?? profile?.furusato.donatedAmount ?? 0, maxDonation);

  // profile/paramsが揃うまでは空配列にする(フックはガードより前で無条件に呼ぶ必要があるため、
  // Reactのフック呼び出し順を崩さないようguardのJSX returnより前に置く)。
  const curveData = useMemo(() => {
    if (!profile || !params) return [];
    return buildSelfBurdenCurve(profile, params, maxDonation, limitAmount);
  }, [profile, params, maxDonation, limitAmount]);

  if (!profile) {
    return (
      <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>シミュレーション</h1>
        </div>
        <p style={{ marginTop: '1.5rem' }}>この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。</p>
        <button type="button" onClick={() => navigate('income')}>
          収入入力へ
        </button>
      </main>
    );
  }

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
          <h1 style={{ margin: 0 }}>シミュレーション</h1>
        </div>
        {errorBanner}
        <p style={{ marginTop: '1.5rem' }}>税制パラメータを計算しています…</p>
      </main>
    );
  }

  const currentSelfBurden = computeSelfBurden(profile, donationValue, params);

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>シミュレーション ({profile.year}年分)</h1>
      </div>
      {errorBanner}

      <section style={{ marginTop: '1.5rem' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
          <span>
            寄附額 <span className="amount">{donationValue.toLocaleString()}円</span>
          </span>
          <input
            type="range"
            aria-label="寄附額"
            min={0}
            max={maxDonation}
            step={CURVE_STEP_MIN}
            value={donationValue}
            onChange={(e) => setDonation(Number(e.target.value))}
          />
        </label>
        <p style={{ marginTop: '0.5rem' }}>
          自己負担額{' '}
          <span className="amount" style={{ fontSize: '1.3rem', fontWeight: 700 }}>
            {currentSelfBurden.toLocaleString()}円
          </span>
          {donationValue > limitAmount && (
            <span style={{ marginLeft: '0.5rem', fontSize: '0.85rem', color: 'var(--color-warning)' }}>
              ⚠ 上限(￥{limitAmount.toLocaleString()})を超えています
            </span>
          )}
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>自己負担曲線</h2>
        <div style={{ width: '100%', height: 300 }}>
          <ResponsiveContainer>
            <LineChart data={curveData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
              <XAxis dataKey="donation" type="number" domain={[0, maxDonation]} tickFormatter={(v: number) => `${(v / 10000).toLocaleString()}万`} />
              <YAxis tickFormatter={(v: number) => `${(v / 1000).toLocaleString()}千`} />
              <Tooltip
                formatter={(value) => `${Number(value).toLocaleString()}円`}
                labelFormatter={(label) => `寄附額 ${Number(label).toLocaleString()}円`}
              />
              <ReferenceLine
                x={limitAmount}
                stroke="var(--color-danger)"
                strokeDasharray="4 4"
                label={{ value: '上限', position: 'top', fill: 'var(--color-danger)' }}
              />
              <Line type="monotone" dataKey="selfBurden" name="自己負担額" stroke="var(--color-series-1)" dot={false} isAnimationActive={false} />
              <ReferenceDot x={donationValue} y={currentSelfBurden} r={5} fill="var(--color-series-2)" stroke="none" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </main>
  );
}

function computeSelfBurden(profile: YearProfile, donation: number, params: TaxParams): number {
  return selfBurden(profile, donation as Yen, params, 'standard');
}
