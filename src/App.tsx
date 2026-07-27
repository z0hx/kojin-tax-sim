import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useNavigation } from './ui/navigation';
import { Header } from './ui/components/Header';
import { WelcomeScreen } from './ui/screens/WelcomeScreen';
import { PersonManagementScreen } from './ui/screens/PersonManagementScreen';

const DISCLAIMER = '本アプリの出力は概算であり、税務上の助言ではありません。実際の申告・納税額は、税務署または税理士にご確認ください。';

export default function App() {
  const isLoading = useAppStore((s) => s.isLoading);
  const appData = useAppStore((s) => s.appData);
  const onboardingRequired = useAppStore((s) => s.onboardingRequired);
  const loadInitialData = useAppStore((s) => s.loadInitialData);
  const screen = useNavigation((s) => s.screen);

  useEffect(() => {
    void loadInitialData();
  }, [loadInitialData]);

  if (isLoading || appData === null) {
    return <p style={{ padding: '2rem' }}>読み込み中…</p>;
  }

  if (onboardingRequired) {
    return <WelcomeScreen />;
  }

  return (
    <div>
      <Header />
      {screen === 'personManagement' ? (
        <PersonManagementScreen />
      ) : (
        <main style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
          <p>計算エンジンと永続化層、人物プロファイル管理の実装が完了しています。他の画面は今後のフェーズで実装予定です。</p>
        </main>
      )}
      <footer style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>{DISCLAIMER}</footer>
    </div>
  );
}
