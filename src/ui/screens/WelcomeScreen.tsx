import { useState, type FormEvent } from 'react';
import { useAppStore } from '../../store/useAppStore';

const DEFAULT_COLOR = '#3366cc';

/**
 * 人物が1人も存在しない場合の暫定的なブートストラップ画面。
 * Issue #4(S-12 オンボーディング、3ステップウィザード)が実装されたら本コンポーネントは丸ごと置き換えられる想定で、
 * ここでは最初の人物を作成できる最小限のフォームのみを提供する(S-10人物管理とは責務を分離する)。
 */
export function WelcomeScreen() {
  const addPerson = useAppStore((s) => s.addPerson);
  const [displayName, setDisplayName] = useState('本人');
  const [color, setColor] = useState(DEFAULT_COLOR);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const name = displayName.trim() || '本人';
    addPerson(name, color);
  }

  return (
    <main style={{ maxWidth: 480, margin: '3rem auto', padding: '0 1rem' }}>
      <h1>TaxSim</h1>
      <p>個人税額・ふるさと納税上限シミュレータ</p>
      <p>入力したデータはこの端末のブラウザ内にのみ保存されます。まずは人物を作成してください。</p>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label>
          表示名(本名でなくても構いません)
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '0.25rem' }}
          />
        </label>
        <label>
          識別色
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ display: 'block', marginTop: '0.25rem' }} />
        </label>
        <button type="submit">作成</button>
      </form>
    </main>
  );
}
