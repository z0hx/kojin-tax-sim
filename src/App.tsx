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
import { DashboardScreen } from './ui/screens/DashboardScreen';
import { CalculationDetailScreen } from './ui/screens/CalculationDetailScreen';
import { SimulationScreen } from './ui/screens/SimulationScreen';
import { ActualsScreen } from './ui/screens/ActualsScreen';

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
      ) : screen === 'calculationDetail' ? (
        <CalculationDetailScreen />
      ) : screen === 'simulation' ? (
        <SimulationScreen />
      ) : screen === 'actuals' ? (
        <ActualsScreen />
      ) : (
        <DashboardScreen />
      )}
      <Disclaimer />
    </div>
  );
}
