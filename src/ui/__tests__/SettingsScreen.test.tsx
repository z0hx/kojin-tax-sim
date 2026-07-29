// @vitest-environment jsdom
/**
 * 基本設定画面(Issue #38)の統合テスト。完了条件:
 * (1) 自治体設定をUIから変更でき、年度プロファイルと人物の既定値の両方へ反映される
 * (2) 年度データが無い人物でも既定値を編集できる
 * (3) 安全率の初期値を変更でき、新しい年度に引き継がれる
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import App from '../../App';
import { useAppStore, initialState } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { clearAppData } from '../../persistence/repository';
import { flushNow, resetSaveQueueForTests } from '../../store/saveQueue';
import {
  installMemoryLocalStorage,
  installStoragePersistMock,
  stubFetchForTaxParams,
  uninstallMemoryLocalStorage,
  uninstallStoragePersistMock,
} from '../../store/__tests__/testUtils';

beforeEach(async () => {
  await clearAppData();
  resetSaveQueueForTests();
  installMemoryLocalStorage();
  stubFetchForTaxParams();
  useAppStore.setState(initialState());
  useNavigation.setState({ screen: 'main' });
});

afterEach(() => {
  cleanup();
  uninstallMemoryLocalStorage();
  uninstallStoragePersistMock();
  vi.unstubAllGlobals();
  resetSaveQueueForTests();
});

async function renderAppAndWaitLoaded() {
  render(<App />);
  await waitFor(() => expect(screen.queryByText('読み込み中…')).not.toBeInTheDocument());
}

async function openSettingsScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '基本設定' }));
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: /基本設定/ })).toBeInTheDocument());
  return screen.getByRole('heading', { level: 1, name: /基本設定/ }).closest('main') as HTMLElement;
}

describe('SettingsScreen(基本設定)', () => {
  it('自治体設定を変更して保存すると、表示中の年度と人物の既定値の両方へ反映される(完了条件)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSettingsScreen();

    await userEvent.type(within(main).getByLabelText('都道府県'), '神奈川県');
    await userEvent.type(within(main).getByLabelText('市区町村'), '横浜市');
    const prefRate = within(main).getByLabelText('所得割率(道府県) %');
    await userEvent.clear(prefRate);
    await userEvent.type(prefRate, '4.025');
    await userEvent.click(within(main).getByRole('button', { name: '自治体設定を保存' }));

    await waitFor(() => expect(within(main).getByRole('status')).toHaveTextContent('2026年分の自治体設定を保存しました。'));

    const person = useAppStore.getState().appData!.persons[0];
    expect(person.years[2026].municipality.prefectureName).toBe('神奈川県');
    expect(person.years[2026].municipality.name).toBe('横浜市');
    expect(person.years[2026].municipality.prefecturalIncomeRate).toBeCloseTo(0.04025, 6);
    // 「新しい年度の初期値にもする」は既定でオンのため、既定値にも同じ値が入る
    expect(person.defaults.municipality.prefectureName).toBe('神奈川県');
    expect(person.defaults.municipality.prefecturalIncomeRate).toBeCloseTo(0.04025, 6);
  });

  it('「新しい年度の初期値にもする」を外すと年度プロファイルだけが変わる', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSettingsScreen();

    await userEvent.click(within(main).getByLabelText('新しい年度を作成したときの初期値にもする'));
    await userEvent.type(within(main).getByLabelText('市区町村'), '川崎市');
    await userEvent.click(within(main).getByRole('button', { name: '自治体設定を保存' }));

    await waitFor(() => expect(useAppStore.getState().appData!.persons[0].years[2026].municipality.name).toBe('川崎市'));
    expect(useAppStore.getState().appData!.persons[0].defaults.municipality.name).toBe('');
  });

  it('所得割率が不正な間は保存ボタンが無効になる', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSettingsScreen();

    await userEvent.clear(within(main).getByLabelText('所得割率(市町村) %'));

    expect(within(main).getByRole('button', { name: '自治体設定を保存' })).toBeDisabled();
    expect(within(main).getAllByRole('alert')[0]).toHaveTextContent('0以上の数値を入力してください');
  });

  it('年度データが無い人物でも既定値として自治体設定を保存できる(FR-09が1人目に限定されていた問題)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('配偶者', '#222222');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSettingsScreen();

    expect(within(main).getByText(/この人物にはまだ年度データがありません/)).toBeInTheDocument();
    await userEvent.type(within(main).getByLabelText('市区町村'), '川崎市');
    await userEvent.click(within(main).getByRole('button', { name: '自治体設定を保存' }));

    await waitFor(() => expect(within(main).getByRole('status')).toHaveTextContent('新しい年度の初期値として自治体設定を保存しました。'));
    expect(useAppStore.getState().appData!.persons[0].defaults.municipality.name).toBe('川崎市');

    // 既定値は新規年度の初期値として引き継がれる
    await useAppStore.getState().createBlankYear(2026);
    expect(useAppStore.getState().appData!.persons[0].years[2026].municipality.name).toBe('川崎市');
  });

  it('画面表示中に人物を切り替えると、切り替え先の現在値がフォームに読み込まれる', async () => {
    installStoragePersistMock();
    const firstId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateMunicipality({ name: '横浜市' });
    const secondId = useAppStore.getState().addPerson('配偶者', '#222222');
    useAppStore.getState().updatePersonDefaults(secondId, { safetyRatio: 0.75 });
    await useAppStore.getState().setActivePerson(firstId);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSettingsScreen();
    expect(within(main).getByLabelText('市区町村')).toHaveValue('横浜市');

    await useAppStore.getState().setActivePerson(secondId);

    await waitFor(() => expect(screen.getByLabelText('市区町村')).toHaveValue(''));
    expect(screen.getByLabelText(/安全率の初期値/)).toHaveValue('75');
  });

  it('安全率の初期値を変更すると新しく作成した年度に引き継がれる', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSettingsScreen();

    fireEvent.change(within(main).getByLabelText(/安全率の初期値/), { target: { value: '80' } });

    await waitFor(() => expect(useAppStore.getState().appData!.persons[0].defaults.safetyRatio).toBeCloseTo(0.8, 6));

    await useAppStore.getState().createBlankYear(2026);
    expect(useAppStore.getState().appData!.persons[0].years[2026].furusato.safetyRatio).toBeCloseTo(0.8, 6);
  });
});
