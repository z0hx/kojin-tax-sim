import { create } from 'zustand';

/**
 * 画面遷移状態。02仕様書§1.4.3の推奨(ルーター不使用・画面切替は状態管理)に従う。
 * 今後の画面Issue(S-01〜S-09, S-11等)が実装される際は、このUnionに画面IDを追加していく想定。
 * URL共有の要件はないため履歴スタックは持たない。
 */
export type ScreenId =
  | 'main'
  | 'personManagement'
  | 'dataManagement'
  | 'income'
  | 'deductions'
  | 'housingLoan'
  | 'calculationDetail'
  | 'simulation'
  | 'actuals'
  | 'scenarioComparison'
  | 'householdView'
  | 'donations'
  | 'settings';

interface NavigationState {
  screen: ScreenId;
  navigate(screen: ScreenId): void;
}

export const useNavigation = create<NavigationState>((set) => ({
  screen: 'main',
  navigate: (screen) => set({ screen }),
}));
