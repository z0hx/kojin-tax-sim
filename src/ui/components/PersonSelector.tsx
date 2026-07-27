import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { PersonAvatar } from './PersonAvatar';

/** 共通ヘッダーの人物セレクタ。識別色付きアバター+表示名で現在の人物を明示し、切替と人物管理への入口を提供する
 *  (02仕様書§5 共通ヘッダー)。人物切替時は先行してsetActivePersonがsaveQueue.flushNowで保存を確定させる。 */
export function PersonSelector() {
  const persons = useAppStore((s) => s.appData?.persons ?? []);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const setActivePerson = useAppStore((s) => s.setActivePerson);
  const navigate = useNavigation((s) => s.navigate);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const activePerson = persons.find((p) => p.id === activePersonId) ?? null;

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  if (!activePerson) return null;

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
      >
        <PersonAvatar displayName={activePerson.displayName} color={activePerson.color} />
        <span>{activePerson.displayName}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="人物を選択"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--color-bg)',
            border: '1px solid var(--color-border)',
            borderRadius: 6,
            minWidth: 200,
            zIndex: 100,
            padding: '0.25rem 0',
          }}
        >
          {persons.map((person) => (
            <button
              key={person.id}
              type="button"
              role="option"
              aria-selected={person.id === activePersonId}
              onClick={async () => {
                setOpen(false);
                if (person.id !== activePersonId) await setActivePerson(person.id);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                width: '100%',
                border: 'none',
                background: person.id === activePersonId ? 'var(--color-selected-bg)' : 'transparent',
                padding: '0.4rem 0.75rem',
                textAlign: 'left',
              }}
            >
              <PersonAvatar displayName={person.displayName} color={person.color} size={22} />
              <span>{person.displayName}</span>
            </button>
          ))}
          <hr style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '0.25rem 0' }} />
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('personManagement');
            }}
            style={{ width: '100%', border: 'none', background: 'transparent', padding: '0.4rem 0.75rem', textAlign: 'left' }}
          >
            ＋ 人物を管理
          </button>
        </div>
      )}
    </div>
  );
}
