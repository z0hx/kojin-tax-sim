import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppStore, DEFAULT_MUNICIPALITY } from '../../store/useAppStore';
import type { MunicipalityConfig } from '../../domain/types';
import { PersonAvatar } from '../components/PersonAvatar';
import { Disclaimer } from '../components/Disclaimer';

const DEFAULT_COLOR = '#3366cc';

function toPercentString(fraction: number): string {
  return String(Number((fraction * 100).toFixed(6)));
}

/** 空文字/NaN/負値はnullを返す(呼び出し側で「未入力・不正」としてブロックする。既定値へのフォールバックはしない) */
function parseNonNegative(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parsePercentToFraction(input: string): number | null {
  const n = parseNonNegative(input);
  return n === null ? null : Number((n / 100).toFixed(6));
}

/** 均等割は常に整数円のため、非負の整数のみを受け付ける(小数はnullとしてブロックする) */
function parseNonNegativeInteger(input: string): number | null {
  const n = parseNonNegative(input);
  return n === null || !Number.isInteger(n) ? null : n;
}

type Step = 1 | 2 | 3;

/**
 * S-12 オンボーディング(02仕様書§5)。初回のみ表示する3ステップウィザード。
 * 人物が1人も存在しない場合にApp.tsxから表示される(WelcomeScreenの後継)。
 */
export function OnboardingScreen() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const requestPersistence = useAppStore((s) => s.requestPersistence);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);

  const [step, setStep] = useState<Step>(1);

  const [displayName, setDisplayName] = useState('本人');
  const [color, setColor] = useState(DEFAULT_COLOR);
  const [nameTouched, setNameTouched] = useState(false);

  const [prefectureName, setPrefectureName] = useState('');
  const [cityName, setCityName] = useState('');
  const [municipalRatePct, setMunicipalRatePct] = useState(toPercentString(DEFAULT_MUNICIPALITY.municipalIncomeRate));
  const [prefecturalRatePct, setPrefecturalRatePct] = useState(toPercentString(DEFAULT_MUNICIPALITY.prefecturalIncomeRate));
  const [municipalPerCapita, setMunicipalPerCapita] = useState(String(DEFAULT_MUNICIPALITY.municipalPerCapita));
  const [prefecturalPerCapita, setPrefecturalPerCapita] = useState(String(DEFAULT_MUNICIPALITY.prefecturalPerCapita));

  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const trimmedName = displayName.trim();
  const nameError = trimmedName.length === 0 ? '表示名を入力してください' : null;

  const municipalRate = parsePercentToFraction(municipalRatePct);
  const prefecturalRate = parsePercentToFraction(prefecturalRatePct);
  const municipalCapita = parseNonNegativeInteger(municipalPerCapita);
  const prefecturalCapita = parseNonNegativeInteger(prefecturalPerCapita);
  const rateErrors = {
    municipalRate: municipalRate === null ? '0以上の数値を入力してください' : null,
    prefecturalRate: prefecturalRate === null ? '0以上の数値を入力してください' : null,
    municipalCapita: municipalCapita === null ? '0以上の整数(円)を入力してください' : null,
    prefecturalCapita: prefecturalCapita === null ? '0以上の整数(円)を入力してください' : null,
  };
  const hasRateError = Object.values(rateErrors).some(Boolean);

  function handleStep2Submit(e: FormEvent) {
    e.preventDefault();
    setNameTouched(true);
    if (!nameError) setStep(3);
  }

  async function handleFinish() {
    if (hasRateError) return;
    const municipality: MunicipalityConfig = {
      name: cityName.trim(),
      prefectureName: prefectureName.trim(),
      municipalIncomeRate: municipalRate as number,
      prefecturalIncomeRate: prefecturalRate as number,
      municipalPerCapita: municipalCapita as number,
      prefecturalPerCapita: prefecturalCapita as number,
      forestTax: DEFAULT_MUNICIPALITY.forestTax,
      useStandardRateForFurusato: DEFAULT_MUNICIPALITY.useStandardRateForFurusato,
    };
    setBusy(true);
    try {
      await completeOnboarding(trimmedName, color, municipality);
      // 完了直後にonboardingRequiredがfalseになりApp.tsxが本画面をアンマウントしうるが、
      // requestPersistenceはストアのアクションでありコンポーネントのマウント状態に依存しないため問題ない
      await requestPersistence();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <main style={{ maxWidth: 560, margin: '3rem auto', padding: '0 1rem' }}>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>ステップ {step} / 3</p>

        {step === 1 && (
          <section>
            <h1 ref={headingRef} tabIndex={-1}>
              データの保存方法について
            </h1>
            <p>入力したデータはこの端末のブラウザ内にのみ保存され、外部に送信されません。</p>
            <p>その代わり、ブラウザのデータを削除すると失われます。定期的なエクスポートをおすすめします。</p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => setStep(2)}>
                次へ
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h1 ref={headingRef} tabIndex={-1}>
              人物を作成
            </h1>
            <p>まずあなた自身(またはこのブラウザで管理する最初の人物)のプロフィールを作成します。表示名は本名でなくても構いません。</p>
            <form onSubmit={handleStep2Submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label>
                表示名
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  onBlur={() => setNameTouched(true)}
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              {nameTouched && nameError && (
                <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
                  {nameError}
                </p>
              )}
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                識別色
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
                <PersonAvatar displayName={trimmedName} color={color} />
              </label>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <button type="button" onClick={() => setStep(1)}>
                  戻る
                </button>
                <button type="submit">次へ</button>
              </div>
            </form>
          </section>
        )}

        {step === 3 && (
          <section>
            <h1 ref={headingRef} tabIndex={-1}>
              自治体を設定
            </h1>
            <p>お住まいの都道府県・市区町村を入力してください。住民税の標準税率が初期値として設定されます。</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label>
                都道府県
                <input
                  type="text"
                  value={prefectureName}
                  onChange={(e) => setPrefectureName(e.target.value)}
                  placeholder="例: 神奈川県"
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>
              <label>
                市区町村
                <input
                  type="text"
                  value={cityName}
                  onChange={(e) => setCityName(e.target.value)}
                  placeholder="例: 横浜市"
                  style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
                />
              </label>

              <details>
                <summary>詳細設定(お住まいの自治体に超過課税がある場合に調整)</summary>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                  <label>
                    所得割率(市町村) %
                    <input
                      type="text"
                      inputMode="decimal"
                      value={municipalRatePct}
                      onChange={(e) => setMunicipalRatePct(e.target.value)}
                      aria-invalid={Boolean(rateErrors.municipalRate)}
                      style={{ display: 'block', marginTop: '0.25rem' }}
                    />
                  </label>
                  {rateErrors.municipalRate && (
                    <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
                      {rateErrors.municipalRate}
                    </p>
                  )}
                  <label>
                    所得割率(道府県) %
                    <input
                      type="text"
                      inputMode="decimal"
                      value={prefecturalRatePct}
                      onChange={(e) => setPrefecturalRatePct(e.target.value)}
                      aria-invalid={Boolean(rateErrors.prefecturalRate)}
                      style={{ display: 'block', marginTop: '0.25rem' }}
                    />
                  </label>
                  {rateErrors.prefecturalRate && (
                    <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
                      {rateErrors.prefecturalRate}
                    </p>
                  )}
                  <label>
                    均等割(市町村) 円
                    <input
                      type="text"
                      inputMode="numeric"
                      value={municipalPerCapita}
                      onChange={(e) => setMunicipalPerCapita(e.target.value)}
                      aria-invalid={Boolean(rateErrors.municipalCapita)}
                      style={{ display: 'block', marginTop: '0.25rem' }}
                    />
                  </label>
                  {rateErrors.municipalCapita && (
                    <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
                      {rateErrors.municipalCapita}
                    </p>
                  )}
                  <label>
                    均等割(道府県) 円
                    <input
                      type="text"
                      inputMode="numeric"
                      value={prefecturalPerCapita}
                      onChange={(e) => setPrefecturalPerCapita(e.target.value)}
                      aria-invalid={Boolean(rateErrors.prefecturalCapita)}
                      style={{ display: 'block', marginTop: '0.25rem' }}
                    />
                  </label>
                  {rateErrors.prefecturalCapita && (
                    <p role="alert" style={{ color: 'var(--color-danger)', margin: 0, fontSize: '0.85rem' }}>
                      {rateErrors.prefecturalCapita}
                    </p>
                  )}
                  <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                    森林環境税(国税) {DEFAULT_MUNICIPALITY.forestTax.toLocaleString()}円は自治体によらず一律です。
                  </p>
                </div>
              </details>
            </div>

            {lastError && (
              <div
                role="alert"
                style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem', borderRadius: 4, fontSize: '0.85rem', marginTop: '0.75rem' }}
              >
                {lastError.message}
                <button type="button" onClick={clearLastError} style={{ marginLeft: '0.5rem' }}>
                  閉じる
                </button>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '1rem' }}>
              <button type="button" onClick={() => setStep(2)} disabled={busy}>
                戻る
              </button>
              <button type="button" onClick={handleFinish} disabled={busy || hasRateError}>
                {busy ? '処理中…' : '完了'}
              </button>
            </div>
          </section>
        )}
      </main>
      <Disclaimer />
    </div>
  );
}
