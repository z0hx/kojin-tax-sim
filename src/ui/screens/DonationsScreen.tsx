import { useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { evaluateOneStopEligibility } from '../../domain/donations';
import { daysSince, todayIso } from '../dateUtils';
import { parseNonNegativeInt } from '../parseAmount';

/**
 * 寄附実績記録画面(FR-21、Issue #17)。実際に寄附した自治体・金額・日付を記録し、
 * 上限額に対する残枠(furusato.donatedAmountはこの一覧の合計から導出、store.recordDonation参照)と、
 * ワンストップ特例の要否・締切(翌年1月10日必着)を一覧表示する。
 */
export function DonationsScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const calculationResult = useAppStore((s) => s.calculationResult);
  const taxParams = useAppStore((s) => s.taxParams);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);
  const recordDonation = useAppStore((s) => s.recordDonation);
  const removeDonation = useAppStore((s) => s.removeDonation);
  const updateFurusatoInput = useAppStore((s) => s.updateFurusatoInput);

  const [municipalityName, setMunicipalityName] = useState('');
  const [amountText, setAmountText] = useState('');
  const [date, setDate] = useState(todayIso());
  const [formError, setFormError] = useState<string | null>(null);

  const person = appData?.persons.find((p) => p.id === activePersonId);
  const profile = person && activeYear !== null ? person.years[activeYear] : undefined;

  if (!profile) {
    return (
      <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button type="button" onClick={() => navigate('main')}>
            ← 戻る
          </button>
          <h1 style={{ margin: 0 }}>寄附実績</h1>
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
          <h1 style={{ margin: 0 }}>寄附実績</h1>
        </div>
        {errorBanner}
        <p style={{ marginTop: '1.5rem' }}>税制パラメータを計算しています…</p>
      </main>
    );
  }

  const donations = profile.furusato.donations;
  const limitAmount = calculationResult.furusato.limitAmount;
  const remaining = Math.max(0, limitAmount - profile.furusato.donatedAmount);
  const oneStop = evaluateOneStopEligibility(profile);
  const deadlinePassed = daysSince(oneStop.deadline) > 0;
  const method = profile.furusato.method;

  function handleAdd() {
    setFormError(null);
    const name = municipalityName.trim();
    if (name === '') {
      setFormError('自治体名を入力してください');
      return;
    }
    const amount = parseNonNegativeInt(amountText);
    if (amount === null) {
      setFormError('金額は0以上の整数で入力してください');
      return;
    }
    if (date === '') {
      setFormError('寄附日を入力してください');
      return;
    }
    recordDonation({ municipalityName: name, amount, date });
    setMunicipalityName('');
    setAmountText('');
  }

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>寄附実績 ({person!.displayName} {profile.year}年分)</h1>
      </div>
      {errorBanner}

      <section style={{ marginTop: '1.5rem' }}>
        <p style={{ margin: '0.2rem 0' }}>
          上限額 <span className="amount">{limitAmount.toLocaleString()}円</span>
        </p>
        <p style={{ margin: '0.2rem 0' }}>
          寄附済み <span className="amount">{profile.furusato.donatedAmount.toLocaleString()}円</span>
        </p>
        <p style={{ margin: '0.2rem 0', fontSize: '1.2rem', fontWeight: 700 }}>
          残り <span className="amount">{remaining.toLocaleString()}円</span>
        </p>
      </section>

      {/* FR-14。申告方式は寄附金控除の申告手続きの選択であり、寄附の記録と同じ画面に置く。
          選択した方式はW-04(医療費控除がある状態でのワンストップ特例警告)の発火条件にも連動する */}
      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>申告方式</h2>
        <div role="radiogroup" aria-label="申告方式" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input
              type="radio"
              name="furusatoMethod"
              value="oneStop"
              checked={method === 'oneStop'}
              onChange={() => updateFurusatoInput({ method: 'oneStop' })}
            />
            ワンストップ特例
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <input
              type="radio"
              name="furusatoMethod"
              value="taxReturn"
              checked={method === 'taxReturn'}
              onChange={() => updateFurusatoInput({ method: 'taxReturn' })}
            />
            確定申告
          </label>
        </div>
      </section>

      <section
        style={{
          marginTop: '1.5rem',
          padding: '0.6rem 0.8rem',
          borderRadius: 6,
          background: oneStop.eligible ? 'var(--color-selected-bg)' : 'var(--color-danger-bg)',
          color: oneStop.eligible ? 'var(--color-fg)' : 'var(--color-danger)',
        }}
      >
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.4rem' }}>ワンストップ特例</h2>
        {oneStop.eligible ? (
          <p style={{ margin: 0 }}>
            利用できます。申請書の提出期限は <strong>{oneStop.deadline}</strong> です(各自治体へ寄附ごとに提出が必要です)。
          </p>
        ) : (
          <p style={{ margin: 0 }}>利用できません。{oneStop.reason}</p>
        )}
        {oneStop.eligible && deadlinePassed && method === 'oneStop' && (
          <p role="alert" style={{ margin: '0.4rem 0 0', fontWeight: 700 }}>
            ⚠ 提出期限({oneStop.deadline})を過ぎています。確定申告での申告に切り替えてください。
          </p>
        )}
        {!oneStop.eligible && method === 'oneStop' && (
          <p role="alert" style={{ margin: '0.4rem 0 0', fontWeight: 700 }}>
            ⚠ 申告方式が「ワンストップ特例」のままです。このままでは寄附金控除が受けられません。{' '}
            <button type="button" onClick={() => updateFurusatoInput({ method: 'taxReturn' })}>
              確定申告に切り替える
            </button>
          </p>
        )}
        {method === 'taxReturn' && (
          <p style={{ margin: '0.4rem 0 0' }}>
            申告方式は「確定申告」です。ワンストップ特例申請書は提出せず、確定申告で寄附金控除を申告してください。
          </p>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>寄附実績を追加</h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <label>
            自治体名
            <input
              type="text"
              value={municipalityName}
              onChange={(e) => setMunicipalityName(e.target.value)}
              placeholder="例: 横浜市"
              style={{ marginLeft: '0.25rem' }}
            />
          </label>
          <label>
            金額(円)
            <input
              className="amount"
              type="text"
              inputMode="numeric"
              value={amountText}
              onChange={(e) => setAmountText(e.target.value)}
              style={{ marginLeft: '0.25rem', width: '8rem' }}
            />
          </label>
          <label>
            寄附日
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ marginLeft: '0.25rem' }} />
          </label>
          <button type="button" onClick={handleAdd}>
            追加
          </button>
        </div>
        {formError && (
          <p role="alert" style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>
            {formError}
          </p>
        )}
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>寄附実績一覧</h2>
        {donations.length === 0 ? (
          <p style={{ color: 'var(--color-muted)' }}>まだ寄附実績がありません。</p>
        ) : (
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={thStyle}>自治体</th>
                <th style={thStyle}>金額</th>
                <th style={thStyle}>寄附日</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {donations.map((d) => (
                <tr key={d.id}>
                  <td style={tdStyle}>{d.municipalityName}</td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{d.amount.toLocaleString()}円</span>
                  </td>
                  <td style={tdStyle}>{d.date}</td>
                  <td style={tdStyle}>
                    <button type="button" onClick={() => removeDonation(d.id)}>
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

const thStyle = { textAlign: 'left' as const, padding: '0.4rem 0.8rem', borderBottom: '2px solid var(--color-border)' };
const tdStyle = { padding: '0.4rem 0.8rem', borderBottom: '1px solid var(--color-border)' };
