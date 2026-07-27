import { useEffect } from 'react';
import { useAppStore } from './store/useAppStore';
import { useNavigation } from './ui/navigation';
import { Header } from './ui/components/Header';
import { Disclaimer } from './ui/components/Disclaimer';
import { OnboardingScreen } from './ui/screens/OnboardingScreen';
import { PersonManagementScreen } from './ui/screens/PersonManagementScreen';
import { DataManagementScreen } from './ui/screens/DataManagementScreen';
import { IncomeScreen } from './ui/screens/IncomeScreen';
import { DeductionsScreen } from './ui/screens/DeductionsScreen';
import { HousingLoanScreen } from './ui/screens/HousingLoanScreen';

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
    return <OnboardingScreen />;
  }

  return (
    <div>
      <Header />
      {screen === 'personManagement' ? (
        <PersonManagementScreen />
      ) : screen === 'dataManagement' ? (
        <DataManagementScreen />
      ) : screen === 'income' ? (
        <IncomeScreen />
      ) : screen === 'deductions' ? (
        <DeductionsScreen />
      ) : screen === 'housingLoan' ? (
        <HousingLoanScreen />
      ) : (
        <main style={{ maxWidth: 640, margin: '2rem auto', padding: '0 1rem' }}>
          <p>計算エンジンと永続化層、人物プロファイル管理の実装が完了しています。ダッシュボード等の他の画面は今後のフェーズで実装予定です。</p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="button" onClick={() => useNavigation.getState().navigate('income')}>
              収入入力へ
            </button>
            <button type="button" onClick={() => useNavigation.getState().navigate('deductions')}>
              控除入力へ
            </button>
            <button type="button" onClick={() => useNavigation.getState().navigate('housingLoan')}>
              住宅ローン控除へ
            </button>
          </div>
        </main>
      )}
      <Disclaimer />
    </div>
  );
}
