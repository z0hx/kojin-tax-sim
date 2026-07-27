import { useEffect, useRef, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { PersonSelector } from './PersonSelector';

/** 共通ヘッダー(02仕様書§5)。年度表示は現状値の表示のみで、切替UIは他Issue(ダッシュボード等)の範囲。
 *  ⚙メニューは画面遷移の汎用の入口として、人物管理・データ管理を置く。 */
export function Header() {
  const activeYear = useAppStore((s) => s.activeYear);
  const navigate = useNavigation((s) => s.navigate);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', handlePointerDown);
    return () => window.removeEventListener('mousedown', handlePointerDown);
  }, [menuOpen]);

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.5rem 1rem',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <strong>TaxSim</strong>
      <PersonSelector />
      {activeYear !== null && <span>{activeYear}年分</span>}
      <div ref={menuRef} style={{ position: 'relative', marginLeft: 'auto' }}>
        <button type="button" aria-haspopup="menu" aria-expanded={menuOpen} aria-label="設定" onClick={() => setMenuOpen((v) => !v)}>
          ⚙
        </button>
        {menuOpen && (
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: 4,
              background: 'var(--color-bg)',
              border: '1px solid var(--color-border)',
              borderRadius: 6,
              zIndex: 100,
              padding: '0.25rem 0',
              minWidth: 160,
            }}
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate('income');
              }}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: '0.4rem 0.75rem', textAlign: 'left' }}
            >
              収入入力
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate('deductions');
              }}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: '0.4rem 0.75rem', textAlign: 'left' }}
            >
              控除入力
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate('housingLoan');
              }}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: '0.4rem 0.75rem', textAlign: 'left' }}
            >
              住宅ローン控除
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate('personManagement');
              }}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: '0.4rem 0.75rem', textAlign: 'left' }}
            >
              人物管理
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                navigate('dataManagement');
              }}
              style={{ width: '100%', border: 'none', background: 'transparent', padding: '0.4rem 0.75rem', textAlign: 'left' }}
            >
              データ管理
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
