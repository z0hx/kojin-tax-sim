import { useEffect, useState, type ChangeEvent, type CSSProperties } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { ConfirmDialog } from '../components/ConfirmDialog';
import type { ImportMode } from '../../persistence/importer';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatMB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateJa(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatDateTimeJa(iso: string): string {
  const d = new Date(iso);
  return `${formatDateJa(iso)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function persistenceStatusLabel(state: 'unsupported' | 'granted' | 'denied' | 'unknown'): string {
  switch (state) {
    case 'granted':
      return '許可済み';
    case 'denied':
      return '未許可(拒否されました)';
    case 'unsupported':
      return '未対応のブラウザです';
    default:
      return '未確認';
  }
}

function describeEntries(entries: { displayName: string }[]): string {
  return entries.length > 0 ? `(${entries.map((e) => e.displayName).join('、')})` : '';
}

const muted: CSSProperties = { color: 'var(--color-muted)', fontSize: '0.85rem' };
const warning: CSSProperties = { color: 'var(--color-danger)' };
const sectionStyle: CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  padding: '1rem',
  marginTop: '1.5rem',
};

/** S-09 データ管理画面(02仕様書§5)。保存状態表示・エクスポート・インポート・全データ削除を扱う。
 *  実体のロジックはpersistence層・store層に実装済みで、本コンポーネントは入力UIと結線のみを担う。 */
export function DataManagementScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const persistenceState = useAppStore((s) => s.persistenceState);
  const storageUsage = useAppStore((s) => s.storageUsage);
  const importPreview = useAppStore((s) => s.importPreview);
  const lastError = useAppStore((s) => s.lastError);
  const requestPersistence = useAppStore((s) => s.requestPersistence);
  const refreshStorageUsage = useAppStore((s) => s.refreshStorageUsage);
  const exportData = useAppStore((s) => s.exportData);
  const previewImport = useAppStore((s) => s.previewImport);
  const commitImport = useAppStore((s) => s.commitImport);
  const cancelImportPreview = useAppStore((s) => s.cancelImportPreview);
  const deleteAllData = useAppStore((s) => s.deleteAllData);
  const clearLastError = useAppStore((s) => s.clearLastError);

  const persons = appData?.persons ?? [];

  useEffect(() => {
    void refreshStorageUsage();
  }, [refreshStorageUsage]);

  const [persistBusy, setPersistBusy] = useState(false);
  async function handleRequestPersistence() {
    setPersistBusy(true);
    await requestPersistence();
    setPersistBusy(false);
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(persons.map((p) => p.id)));
  const [useEncryption, setUseEncryption] = useState(false);
  const [passphrase, setPassphrase] = useState('');
  const [exportBusy, setExportBusy] = useState(false);

  function togglePerson(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const noSelection = selectedIds.size === 0;
  const passphraseMissing = useEncryption && passphrase.trim().length === 0;

  async function handleExport() {
    if (noSelection || passphraseMissing) return;
    setExportBusy(true);
    const personIds = selectedIds.size === persons.length ? 'all' : Array.from(selectedIds);
    await exportData({ personIds, passphrase: useEncryption ? passphrase.trim() : undefined, includeSettings: true });
    setExportBusy(false);
  }

  const lastExportedAt = appData?.appSettings.lastExportedAt ?? null;
  const daysSinceExport = lastExportedAt ? daysSince(lastExportedAt) : null;
  const backupOverdue = daysSinceExport === null || daysSinceExport >= 30;

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [importPassphrase, setImportPassphrase] = useState('');
  const [previewBusy, setPreviewBusy] = useState(false);
  const [commitBusy, setCommitBusy] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    setImportSuccess(false);
    setImportFile(e.target.files?.[0] ?? null);
    if (useAppStore.getState().importPreview) cancelImportPreview();
  }

  async function handlePreview() {
    if (!importFile) return;
    setImportSuccess(false);
    setPreviewBusy(true);
    await previewImport(importFile, importMode, importPassphrase.trim() || undefined);
    setPreviewBusy(false);
  }

  async function handleCommitImport() {
    setCommitBusy(true);
    await commitImport(importMode);
    setCommitBusy(false);
    if (!useAppStore.getState().lastError) {
      setImportSuccess(true);
      setImportFile(null);
      setImportPassphrase('');
    }
  }

  const [confirmingDeleteAll, setConfirmingDeleteAll] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);

  async function handleConfirmDeleteAll() {
    setDeletingAll(true);
    await deleteAllData();
    setDeletingAll(false);
    setConfirmingDeleteAll(false);
  }

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>データ管理</h1>
      </div>

      {lastError && (
        <div role="alert" style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.75rem', borderRadius: 4, marginTop: '1rem' }}>
          {lastError.message}
          <button type="button" onClick={clearLastError} style={{ marginLeft: '0.5rem' }}>
            閉じる
          </button>
        </div>
      )}

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>保存状態</h2>
        <p>永続化: {persistenceStatusLabel(persistenceState)}</p>
        {storageUsage && (
          <p>
            使用量 {formatMB(storageUsage.usage)} / 見積上限 {formatMB(storageUsage.quota)}
          </p>
        )}
        {persistenceState !== 'granted' && persistenceState !== 'unsupported' && (
          <button type="button" onClick={handleRequestPersistence} disabled={persistBusy}>
            {persistBusy ? '確認中…' : '永続化を許可する'}
          </button>
        )}
        {persistenceState === 'unsupported' && <p style={muted}>このブラウザは永続化許可のAPIに対応していません。</p>}
        <p style={muted}>⚠ ブラウザの閲覧データを削除すると、保存されているデータは失われます。</p>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>エクスポート</h2>
        <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
          <legend style={{ padding: 0, marginBottom: '0.4rem' }}>対象の人物</legend>
          {persons.map((person) => (
            <label key={person.id} style={{ display: 'block' }}>
              <input type="checkbox" checked={selectedIds.has(person.id)} onChange={() => togglePerson(person.id)} /> {person.displayName}
            </label>
          ))}
        </fieldset>
        {noSelection && (
          <p role="alert" style={warning}>
            エクスポート対象の人物を1人以上選択してください。
          </p>
        )}

        <label style={{ display: 'block', marginTop: '0.75rem' }}>
          <input type="checkbox" checked={useEncryption} onChange={(e) => setUseEncryption(e.target.checked)} /> パスフレーズで暗号化する
        </label>
        {useEncryption ? (
          <>
            <label style={{ display: 'block', marginTop: '0.4rem' }}>
              パスフレーズ
              <input
                type="password"
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                style={{ display: 'block', marginTop: '0.25rem' }}
              />
            </label>
            {passphraseMissing && (
              <p role="alert" style={warning}>
                パスフレーズを入力してください。
              </p>
            )}
            <p style={muted}>パスフレーズを忘れると復号できません。復元手段はありません。</p>
          </>
        ) : (
          <p role="alert" style={warning}>
            所得情報を含む平文ファイルです。取り扱いにご注意ください。
          </p>
        )}

        <p style={{ marginTop: '0.75rem' }}>
          最終エクスポート: {lastExportedAt ? `${formatDateJa(lastExportedAt)}(${daysSinceExport}日前)` : 'まだエクスポートしていません'}
          {backupOverdue && <span style={{ ...warning, marginLeft: '0.4rem' }}>⚠ バックアップをおすすめします</span>}
        </p>

        <button type="button" onClick={handleExport} disabled={noSelection || passphraseMissing || exportBusy}>
          {exportBusy ? '書き出し中…' : 'エクスポート'}
        </button>
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>インポート</h2>
        <label style={{ display: 'block' }}>
          ファイルを選択
          <input
            type="file"
            accept=".json,.taxsim.enc,application/json,application/octet-stream"
            onChange={handleFileChange}
            style={{ display: 'block', marginTop: '0.25rem' }}
          />
        </label>

        <fieldset style={{ border: 'none', padding: 0, margin: '0.75rem 0 0' }}>
          <legend style={{ padding: 0, marginBottom: '0.4rem' }}>モード</legend>
          <label style={{ display: 'block' }}>
            <input type="radio" name="importMode" checked={importMode === 'replace'} onChange={() => setImportMode('replace')} /> 置換 —
            既存データを全削除して置き換える(復元用)
          </label>
          <label style={{ display: 'block' }}>
            <input type="radio" name="importMode" checked={importMode === 'merge'} onChange={() => setImportMode('merge')} /> マージ —
            同一人物は更新日時が新しい方を採用する
          </label>
          <label style={{ display: 'block' }}>
            <input type="radio" name="importMode" checked={importMode === 'addAsNew'} onChange={() => setImportMode('addAsNew')} /> 新規追加 —
            全人物を新しいIDで追加する
          </label>
        </fieldset>

        <label style={{ display: 'block', marginTop: '0.5rem' }}>
          パスフレーズ(暗号化されたファイルの場合のみ)
          <input
            type="password"
            value={importPassphrase}
            onChange={(e) => setImportPassphrase(e.target.value)}
            style={{ display: 'block', marginTop: '0.25rem' }}
          />
        </label>

        <button type="button" onClick={handlePreview} disabled={!importFile || previewBusy} style={{ marginTop: '0.75rem' }}>
          {previewBusy ? '確認中…' : 'プレビュー'}
        </button>

        {importSuccess && <p role="status">インポートが完了しました。</p>}

        {importPreview && (
          <div style={{ marginTop: '1rem', borderTop: '1px solid var(--color-border)', paddingTop: '1rem' }}>
            <p>ファイル: {importPreview.fileName}</p>
            <p>作成日時: {importPreview.exportedAt ? formatDateTimeJa(importPreview.exportedAt) : '不明'}</p>
            <p>スキーマ: v{importPreview.schemaVersion}({importPreview.migrationApplied ? '移行を適用しました' : '移行不要'})</p>
            <ul>
              <li>{`追加される人物 ${importPreview.added.length}件 ${describeEntries(importPreview.added)}`.trim()}</li>
              <li>{`更新される人物 ${importPreview.updated.length}件 ${describeEntries(importPreview.updated)}`.trim()}</li>
              <li>{`削除される人物 ${importPreview.removed.length}件 ${describeEntries(importPreview.removed)}`.trim()}</li>
            </ul>
            {importMode === 'replace' && (
              <p role="alert" style={warning}>
                置換を実行すると、まず現在のデータを自動的にバックアップとしてダウンロードしてから置き換えます。
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" onClick={cancelImportPreview} disabled={commitBusy}>
                キャンセル
              </button>
              <button type="button" onClick={handleCommitImport} disabled={commitBusy}>
                {commitBusy ? '処理中…' : 'インポートを実行'}
              </button>
            </div>
          </div>
        )}
      </section>

      <section style={sectionStyle}>
        <h2 style={{ marginTop: 0 }}>全データ削除</h2>
        <p>この端末に保存されている全人物・全年度のデータが完全に削除されます。共有端末での利用後などを想定しています。</p>
        <button type="button" onClick={() => setConfirmingDeleteAll(true)}>
          全データを削除
        </button>
      </section>

      {confirmingDeleteAll && (
        <ConfirmDialog
          title="全データを削除しますか?"
          message={
            'この端末に保存されている全人物・全年度のデータが完全に削除されます。この操作は取り消せません。\n事前にエクスポートでバックアップを取ることをおすすめします。'
          }
          confirmLabel="完全に削除する"
          danger
          busy={deletingAll}
          requireTypedText="削除"
          onConfirm={handleConfirmDeleteAll}
          onCancel={() => setConfirmingDeleteAll(false)}
        />
      )}
    </main>
  );
}
