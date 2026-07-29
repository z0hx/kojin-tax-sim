import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useAppStore, DEFAULT_MUNICIPALITY } from '../../store/useAppStore';
import { PersonAvatar } from '../components/PersonAvatar';
import { Disclaimer } from '../components/Disclaimer';
import { MunicipalityForm, draftToConfig, hasDraftError, toDraft, validateDraft } from '../components/MunicipalityForm';

const DEFAULT_COLOR = '#3366cc';

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

  const [draft, setDraft] = useState(() => toDraft(DEFAULT_MUNICIPALITY));

  const [busy, setBusy] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [step]);

  const trimmedName = displayName.trim();
  const nameError = trimmedName.length === 0 ? '表示名を入力してください' : null;

  const rateErrors = validateDraft(draft);
  const hasRateError = hasDraftError(rateErrors);

  function handleStep2Submit(e: FormEvent) {
    e.preventDefault();
    setNameTouched(true);
    if (!nameError) setStep(3);
  }

  async function handleFinish() {
    const municipality = draftToConfig(draft, DEFAULT_MUNICIPALITY);
    if (municipality === null) return;
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

        {/* 起動時の検証で保存データを破棄した場合(#36)もここに出るため、ステップを問わず先頭に置く */}
        {lastError && (
          <div
            role="alert"
            style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem', borderRadius: 4, fontSize: '0.85rem', marginBottom: '0.75rem' }}
          >
            {lastError.message}
            <button type="button" onClick={clearLastError} style={{ marginLeft: '0.5rem' }}>
              閉じる
            </button>
          </div>
        )}

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
            <MunicipalityForm draft={draft} onChange={setDraft} errors={rateErrors} forestTax={DEFAULT_MUNICIPALITY.forestTax} />

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
