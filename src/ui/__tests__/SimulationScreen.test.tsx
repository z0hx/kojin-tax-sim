// @vitest-environment jsdom
/**
 * S-06 シミュレーション画面の統合テスト。他画面のテストと同様、実際のZustandストア(シングルトン)・
 * IndexedDB(fake-indexeddb)を通して検証する。Issue #11完了条件:
 * (1) スライダー操作にリアルタイムで再計算・グラフ更新が追従する(NFR-07: 100ms以内)
 * (2) 上限を超えた領域の傾きの変化が視覚的に分かる
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

async function openSimulationScreen() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'シミュレーション' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: /シミュレーション/ })).toBeInTheDocument());
  return screen.getByRole('heading', { name: /シミュレーション/ }).closest('main') as HTMLElement;
}

async function setupTaxableProfile() {
  installStoragePersistMock();
  useAppStore.getState().addPerson('本人', '#111111');
  await useAppStore.getState().createBlankYear(2026);
  useAppStore.getState().updateIncome({
    monthly: Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      status: 'actual' as const,
      grossSalary: 500_000,
      socialInsurance: 70_000,
      isSocialInsuranceExempt: false,
    })),
  });
  await flushNow();
}

describe('SimulationScreen(S-06)', () => {
  it('人物の年度データが無い場合は収入入力画面への案内が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSimulationScreen();

    expect(within(main).getByText('この人物にはまだ年度データがありません。先に収入入力画面で年度を作成してください。')).toBeInTheDocument();
    await userEvent.click(within(main).getByRole('button', { name: '収入入力へ' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  });

  it('スライダーを動かすと自己負担額の表示がその場で更新される', async () => {
    await setupTaxableProfile();
    await renderAppAndWaitLoaded();
    const main = await openSimulationScreen();

    const slider = within(main).getByLabelText('寄附額') as HTMLInputElement;
    const before = useAppStore.getState().calculationResult!.furusato.limitAmount;

    fireEvent.change(slider, { target: { value: String(before + 30_000) } });

    await waitFor(() => expect(within(main).getByText(/上限.*を超えています/)).toBeInTheDocument());
  });

  it('上限以下では警告が表示されず、上限を超えると警告が表示される(傾きの変化を示す視覚的手がかり)', async () => {
    await setupTaxableProfile();
    await renderAppAndWaitLoaded();
    const main = await openSimulationScreen();

    const slider = within(main).getByLabelText('寄附額') as HTMLInputElement;
    const limit = useAppStore.getState().calculationResult!.furusato.limitAmount;

    fireEvent.change(slider, { target: { value: String(Math.max(0, limit - 10_000)) } });
    expect(within(main).queryByText(/を超えています/)).not.toBeInTheDocument();

    fireEvent.change(slider, { target: { value: String(limit + 10_000) } });
    expect(within(main).getByText(/を超えています/)).toBeInTheDocument();
  });

  it('スライダー操作の再計算がNFR-07(100ms以内)を満たす', async () => {
    await setupTaxableProfile();
    await renderAppAndWaitLoaded();
    const main = await openSimulationScreen();

    const slider = within(main).getByLabelText('寄附額') as HTMLInputElement;
    const limit = useAppStore.getState().calculationResult!.furusato.limitAmount;

    const start = performance.now();
    fireEvent.change(slider, { target: { value: String(limit) } });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it('実績の寄附済み額がmaxDonationを超える場合、スライダーのつまみと表示額が一致するようクランプされる(実装後レビュー対応)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    // 低収入(上限額が小さい)プロファイルに、maxDonationを大きく超える寄附済み額を設定する
    useAppStore.getState().updateIncome({
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: 'actual' as const,
        grossSalary: 150_000,
        socialInsurance: 20_000,
        isSocialInsuranceExempt: false,
      })),
    });
    useAppStore.getState().updateFurusatoInput({ donatedAmount: 200_000 });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSimulationScreen();

    const slider = within(main).getByLabelText('寄附額') as HTMLInputElement;
    // 表示テキストの金額(スライダーのラベル内)と、ネイティブinputのvalue(クランプ後)が一致していること
    const label = slider.closest('label')!;
    const displayedText = within(label).getByText(/円$/, { selector: 'span.amount' }).textContent!;
    const displayedAmount = Number(displayedText.replace(/[^\d]/g, ''));
    expect(Number(slider.value)).toBe(displayedAmount);
    expect(Number(slider.value)).toBeLessThanOrEqual(Number(slider.max));
  });

  it('人物を切り替えると探索用のスライダー値が破棄され、新しい人物の実績値に戻る(実装後レビュー対応)', async () => {
    installStoragePersistMock();
    const personAId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: 'actual' as const,
        grossSalary: 500_000,
        socialInsurance: 70_000,
        isSocialInsuranceExempt: false,
      })),
    });
    await flushNow();

    const personBId = useAppStore.getState().addPerson('配偶者', '#222222');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await useAppStore.getState().setActivePerson(personAId);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openSimulationScreen();

    const slider = within(main).getByLabelText('寄附額') as HTMLInputElement;
    fireEvent.change(slider, { target: { value: '40000' } });
    await waitFor(() => expect(within(main).getByLabelText('寄附額')).toHaveValue('40000'));

    await useAppStore.getState().setActivePerson(personBId);
    await flushNow();

    // 配偶者(実績寄附済み額0円)に切り替えたら、本人で操作した40,000円が残っていないこと
    await waitFor(() => expect(within(main).getByLabelText('寄附額')).toHaveValue('0'));
  });

  it('自己負担曲線のグラフ領域が描画される', async () => {
    await setupTaxableProfile();
    await renderAppAndWaitLoaded();
    const main = await openSimulationScreen();

    // recharts(SVG)はjsdom上でResponsiveContainerが実寸を取れず内部要素(ReferenceLineのラベル等)は
    // 描画されないため、コンテナ自体の存在で「グラフが例外なく組み立てられたこと」を確認する
    expect(within(main).getByText('自己負担曲線')).toBeInTheDocument();
    expect(main.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });
});
