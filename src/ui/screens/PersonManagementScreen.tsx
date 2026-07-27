import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore';
import type { Person } from '../../persistence/types';
import { useNavigation } from '../navigation';
import { PersonAvatar } from '../components/PersonAvatar';
import { ConfirmDialog } from '../components/ConfirmDialog';

const DEFAULT_COLOR = '#3366cc';

interface PersonCardProps {
  person: Person;
  isActive: boolean;
}

function PersonCard({ person, isActive }: PersonCardProps) {
  const setActivePerson = useAppStore((s) => s.setActivePerson);
  const renamePerson = useAppStore((s) => s.renamePerson);
  const setPersonColor = useAppStore((s) => s.setPersonColor);
  const duplicatePerson = useAppStore((s) => s.duplicatePerson);
  const deletePersonWithBackup = useAppStore((s) => s.deletePersonWithBackup);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(person.displayName);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const yearCount = Object.keys(person.years).length;

  function commitRename() {
    const trimmed = nameDraft.trim();
    if (trimmed.length > 0 && trimmed !== person.displayName) renamePerson(person.id, trimmed);
    setEditingName(false);
  }

  async function handleConfirmDelete() {
    setDeleting(true);
    await deletePersonWithBackup(person.id);
    setDeleting(false);
    // 成功時はpersonが一覧から消えてこのカード自体がunmountされる。失敗時はlastErrorが立つので閉じて表示する
    setConfirmingDelete(false);
  }

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 8, padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <PersonAvatar displayName={person.displayName} color={person.color} size={36} />
        {editingName ? (
          <input
            autoFocus
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename();
              if (e.key === 'Escape') {
                setNameDraft(person.displayName);
                setEditingName(false);
              }
            }}
          />
        ) : (
          <button type="button" onClick={() => setEditingName(true)} title="表示名を変更" style={{ fontWeight: 700, fontSize: '1rem' }}>
            {person.displayName}
          </button>
        )}
        {isActive && <span>(選択中)</span>}
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        識別色
        <input type="color" value={person.color} onChange={(e) => setPersonColor(person.id, e.target.value)} />
      </label>

      <p style={{ margin: 0, color: 'var(--color-muted)', fontSize: '0.85rem' }}>{yearCount}年分のデータ</p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {!isActive && (
          <button type="button" onClick={() => setActivePerson(person.id)}>
            選択
          </button>
        )}
        <button type="button" onClick={() => duplicatePerson(person.id)}>
          複製
        </button>
        <button type="button" onClick={() => setConfirmingDelete(true)}>
          削除
        </button>
      </div>

      {lastError && !confirmingDelete && (
        <div
          role="alert"
          style={{ background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem', borderRadius: 4, fontSize: '0.85rem' }}
        >
          {lastError.message}
          <button type="button" onClick={clearLastError} style={{ marginLeft: '0.5rem' }}>
            閉じる
          </button>
        </div>
      )}

      {confirmingDelete && (
        <ConfirmDialog
          title="人物を削除しますか?"
          message={`「${person.displayName}」の全年度データ${yearCount > 0 ? `(${yearCount}年分)` : ''}が消えます。この操作は取り消せません。\n続行すると、削除前にこの人物のデータをエクスポートしてダウンロードします。`}
          confirmLabel="削除する"
          danger
          busy={deleting}
          onConfirm={handleConfirmDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}

/** S-10 人物管理画面(02仕様書§5)。人物の追加・リネーム・識別色変更・複製・削除を行う */
export function PersonManagementScreen() {
  const persons = useAppStore((s) => s.appData?.persons ?? []);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const addPerson = useAppStore((s) => s.addPerson);
  const navigate = useNavigation((s) => s.navigate);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(DEFAULT_COLOR);

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (name.length === 0) return;
    addPerson(name, newColor);
    setNewName('');
    setNewColor(DEFAULT_COLOR);
  }

  return (
    <main style={{ maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>人物管理</h1>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '1rem', marginTop: '1.5rem' }}>
        {persons.map((person) => (
          <PersonCard key={person.id} person={person} isActive={person.id === activePersonId} />
        ))}
      </div>

      <form onSubmit={handleAdd} style={{ marginTop: '2rem', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          表示名(本名でなくても構いません)
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="例: 配偶者" style={{ marginLeft: '0.5rem' }} />
        </label>
        <label>
          識別色
          <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} style={{ marginLeft: '0.5rem' }} />
        </label>
        <button type="submit" disabled={newName.trim().length === 0}>
          ＋ 人物を追加
        </button>
      </form>
    </main>
  );
}
