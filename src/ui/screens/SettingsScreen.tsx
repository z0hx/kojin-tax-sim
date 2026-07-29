import { useState } from 'react';
import { useAppStore, DEFAULT_MUNICIPALITY } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { MunicipalityForm, draftToConfig, hasDraftError, toDraft, validateDraft } from '../components/MunicipalityForm';
import { formatRateAsPercent } from '../parseAmount';

/** 安全率(FR-13)の下限。0%まで許すと推奨額が常に0円になり画面の意味が失われるため、実用範囲に絞る */
const MIN_SAFETY_PERCENT = 50;
const MAX_SAFETY_PERCENT = 100;

/**
 * S-08 設定画面(03詳細設計書§6.3、FR-09/FR-13)。自治体設定と「新しい年度を作成したときの初期値」を編集する。
 * 同§6.3が挙げる`TaxParamsEditor`(税制パラメータのUI編集、FR-19後半)は方針未決のためIssue #43で扱う。
 *
 * 自治体設定はYearProfile.municipality(年度ごと)とPerson.defaults.municipality(新規年度の初期値)の
 * 2箇所に存在する。前者を編集対象とし、後者へ同時に書き込むかをチェックボックスで選ばせる
 * (超過課税率は年度によって変わりうるため、過去年度の値を巻き戻さないよう両者を分けている)。
 * 対象は常にアクティブな人物であり、配偶者等の設定はヘッダーの人物セレクタで切り替えてから行う。
 */
export function SettingsScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const updateMunicipality = useAppStore((s) => s.updateMunicipality);
  const updatePersonDefaults = useAppStore((s) => s.updatePersonDefaults);

  const person = appData?.persons.find((p) => p.id === activePersonId);
  const profile = person && activeYear !== null ? person.years[activeYear] : undefined;
  // 年度データがまだ無い人物(人物管理画面から追加した配偶者など)は既定値だけを編集する
  const baseMunicipality = profile?.municipality ?? person?.defaults.municipality ?? DEFAULT_MUNICIPALITY;

  const [draft, setDraft] = useState(() => toDraft(baseMunicipality));
  const [applyToDefaults, setApplyToDefaults] = useState(true);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [defaultSafetyPercent, setDefaultSafetyPercent] = useState(() =>
    String(Math.round((person?.defaults.safetyRatio ?? 0.9) * 100))
  );

  // 本画面の表示中にヘッダーから人物・年度を切り替えられるため、下書きを対象の現在値へ作り直す
  // (作り直さないと、切り替え前の人物の値を保存してしまう)。レンダー中の同期更新はuseEffectより
  // 1描画早く反映されるため、古い値が一瞬表示されることもない。
  const formKey = `${activePersonId ?? ''}:${activeYear ?? ''}`;
  const [lastFormKey, setLastFormKey] = useState(formKey);
  if (lastFormKey !== formKey) {
    setLastFormKey(formKey);
    setDraft(toDraft(baseMunicipality));
    setDefaultSafetyPercent(String(Math.round((person?.defaults.safetyRatio ?? 0.9) * 100)));
    setSavedMessage(null);
  }

  if (!person) {
    return (
      <main style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
        <p>人物が登録されていません。</p>
      </main>
    );
  }

  const errors = validateDraft(draft);
  const invalid = hasDraftError(errors);

  function handleSaveMunicipality() {
    const config = draftToConfig(draft, baseMunicipality);
    if (config === null) return;
    if (profile) updateMunicipality(config);
    if (applyToDefaults) updatePersonDefaults(person!.id, { municipality: config });
    setSavedMessage(
      profile
        ? `${activeYear}年分の自治体設定を保存しました。${applyToDefaults ? '新しい年度の初期値にも反映しました。' : ''}`
        : '新しい年度の初期値として自治体設定を保存しました。'
    );
  }

  function handleDefaultSafetyChange(value: string) {
    setDefaultSafetyPercent(value);
    const percent = Number(value);
    if (!Number.isFinite(percent)) return;
    updatePersonDefaults(person!.id, { safetyRatio: Number((percent / 100).toFixed(4)) });
  }

  return (
    <main style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>基本設定 ({person.displayName})</h1>
      </div>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1rem' }}>自治体設定{profile ? ` (${profile.year}年分)` : ''}</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginTop: 0 }}>
          {profile
            ? 'お住まいの自治体に超過課税がある場合、住民税額とふるさと納税の上限額が変わります。'
            : 'この人物にはまだ年度データがありません。ここでの設定は新しい年度を作成したときの初期値になります。'}
        </p>
        <MunicipalityForm draft={draft} onChange={setDraft} errors={errors} detailsOpen forestTax={baseMunicipality.forestTax} />

        {profile && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.75rem' }}>
            <input type="checkbox" checked={applyToDefaults} onChange={(e) => setApplyToDefaults(e.target.checked)} />
            新しい年度を作成したときの初期値にもする
          </label>
        )}

        <button type="button" onClick={handleSaveMunicipality} disabled={invalid} style={{ marginTop: '0.75rem' }}>
          自治体設定を保存
        </button>
        {savedMessage && (
          <p role="status" style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>
            {savedMessage}
          </p>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '1rem' }}>安全率の初期値</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginTop: 0 }}>
          新しい年度を作成したときに使う安全率です。表示中の年度の安全率はダッシュボードで変更できます。
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          安全率の初期値
          <input
            type="range"
            min={MIN_SAFETY_PERCENT}
            max={MAX_SAFETY_PERCENT}
            step={1}
            value={defaultSafetyPercent}
            onChange={(e) => handleDefaultSafetyChange(e.target.value)}
          />
          <span className="amount">{defaultSafetyPercent}%</span>
        </label>
      </section>

      {profile && (
        <p style={{ marginTop: '2rem', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
          現在の設定: 所得割 市町村{formatRateAsPercent(profile.municipality.municipalIncomeRate)}% / 道府県
          {formatRateAsPercent(profile.municipality.prefecturalIncomeRate)}% 、均等割 市町村
          {profile.municipality.municipalPerCapita.toLocaleString()}円 / 道府県
          {profile.municipality.prefecturalPerCapita.toLocaleString()}円
        </p>
      )}
    </main>
  );
}
