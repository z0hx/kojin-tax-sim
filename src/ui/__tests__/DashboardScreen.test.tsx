// @vitest-environment jsdom
/**
 * S-01 ダッシュボード画面の統合テスト。他画面のテストと同様、実際のZustandストア(シングルトン)・
 * IndexedDB(fake-indexeddb)を通して検証する。Issue #9完了条件:
 * (1) 上限額が画面上で算出・表示される (2) W-01〜W-08が正しい条件で発火し表示される
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

import App from '../../App';
import { useAppStore, initialState } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { clearAppData, saveAppData } from '../../persistence/repository';
import { flushNow, resetSaveQueueForTests } from '../../store/saveQueue';
import { StorageError } from '../../persistence/errors';
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

describe('DashboardScreen(S-01)', () => {
  it('人物の年度データが無い場合は収入入力画面への案内が表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();

    await renderAppAndWaitLoaded();
    expect(screen.getByText('この人物にはまだ年度データがありません。まず収入入力画面で年度を作成してください。')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '収入入力へ' }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /収入入力/ })).toBeInTheDocument());
  });

  it('上限額・推奨額・寄附済み・残りが表示される(完了条件: 上限額が画面上で算出・表示される)', async () => {
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

    await renderAppAndWaitLoaded();

    await waitFor(() => expect(screen.getByText(/ふるさと納税 上限額/)).toBeInTheDocument());
    expect(screen.getByText(/推奨額/)).toBeInTheDocument();
    expect(screen.getByText(/寄附済み/)).toBeInTheDocument();
    expect(screen.getByText(/残り/)).toBeInTheDocument();
    const result = useAppStore.getState().calculationResult!;
    expect(result.furusato.limitAmount).toBeGreaterThan(0);
  });

  it('医療費控除とワンストップ特例を併用しているとW-04が警告として表示される', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateDeductions({ medical: { paid: 150_000, reimbursed: 0, selfMedication: 0, mode: 'auto' } });
    await flushNow();

    await renderAppAndWaitLoaded();

    await waitFor(() => expect(screen.getByText('W-04')).toBeInTheDocument());
    expect(screen.getByText(/ワンストップ特例は利用できません/)).toBeInTheDocument();
  });

  it('警告が無い場合は「警告はありません」と表示される', async () => {
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

    await renderAppAndWaitLoaded();
    await waitFor(() => expect(screen.getByText('現在、警告はありません。')).toBeInTheDocument());
  });

  it('最終エクスポート未実施の場合はバックアップ督促バナーが表示される(FR-28、Issue #9申し送り対応)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    await waitFor(() => expect(screen.getByText(/バックアップ.*していません/)).toBeInTheDocument());
  });

  it('直近(30日未満)にエクスポート済みの場合はバックアップ督促バナーを表示しない(S-09と同一条件であることの確認)', async () => {
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();
    const current = useAppStore.getState().appData!;
    await saveAppData({ ...current, appSettings: { ...current.appSettings, lastExportedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() } });
    useAppStore.setState(initialState());

    installStoragePersistMock();
    await renderAppAndWaitLoaded();

    await waitFor(() => expect(screen.getByText(/ふるさと納税 上限額/)).toBeInTheDocument());
    expect(screen.queryByText(/バックアップ/)).not.toBeInTheDocument();
  });

  it('最終エクスポートから30日以上経過している場合は経過日数とともにバナーが表示される(S-09と同一条件であることの確認)', async () => {
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();
    const current = useAppStore.getState().appData!;
    await saveAppData({ ...current, appSettings: { ...current.appSettings, lastExportedAt: new Date(Date.now() - 40 * 86_400_000).toISOString() } });
    useAppStore.setState(initialState());

    installStoragePersistMock();
    await renderAppAndWaitLoaded();

    await waitFor(() => expect(screen.getByText(/最終エクスポートから40日経過しています/)).toBeInTheDocument());
  });

  it('年度切替ドロップダウンで既存の別年度に切り替えられ、次年度追加ボタンで新しい年度が作成される', async () => {
    installStoragePersistMock();
    const personId = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2025);
    await flushNow();
    await useAppStore.getState().copyYearFromPrevious(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    await waitFor(() => expect(screen.getByRole('heading', { name: /2026年分/ })).toBeInTheDocument());

    await userEvent.selectOptions(screen.getByLabelText('年度切替'), '2025');
    await waitFor(() => expect(useAppStore.getState().activeYear).toBe(2025));

    await userEvent.click(screen.getByRole('button', { name: '2027年分を追加' }));
    await waitFor(() => expect(useAppStore.getState().activeYear).toBe(2027));
    await waitFor(() => {
      const person = useAppStore.getState().appData!.persons.find((p) => p.id === personId)!;
      expect(person.years[2027]).toBeDefined();
    });
  });

  it('次年度追加ボタンは処理完了までdisabledになり、連打による重複実行を防ぐ(実装後レビュー対応)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2025);
    await flushNow();

    // copyYearFromPreviousの完了タイミングを手動で制御する(fake-indexeddb等の実処理速度に依存すると、
    // disabled状態が一瞬すぎて検出できずテストがフレーキーになるため)。
    let resolveCopy!: () => void;
    const copySpy = vi.fn(() => new Promise<void>((resolve) => (resolveCopy = resolve)));
    useAppStore.setState({ copyYearFromPrevious: copySpy });

    await renderAppAndWaitLoaded();
    const button = await screen.findByRole('button', { name: '2026年分を追加' });

    fireEvent.click(button);
    expect(copySpy).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();

    // disabled中の連打はコンポーネント側のonClickすら発火しない(ブラウザのdisabled属性による抑止)ため、
    // 呼び出し回数が増えないことを確認する
    fireEvent.click(button);
    expect(copySpy).toHaveBeenCalledTimes(1);

    resolveCopy();
    await waitFor(() => expect(button).not.toBeDisabled());
  });

  it('無関係な操作由来のlastErrorが残っていてもバナー表示のみで、ダッシュボード本体はブロックされない', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    await waitFor(() => expect(screen.getByText(/ふるさと納税 上限額/)).toBeInTheDocument());

    useAppStore.setState({ lastError: new StorageError('エクスポートに失敗しました。') });
    await waitFor(() => expect(screen.getByText('エクスポートに失敗しました。')).toBeInTheDocument());
    expect(screen.getByText(/ふるさと納税 上限額/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: '閉じる' }));
    expect(useAppStore.getState().lastError).toBeNull();
  });

  it('印刷ボタンでwindow.print()が呼ばれる(FR-20完了条件)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    const printSpy = vi.fn();
    vi.stubGlobal('print', printSpy);

    await renderAppAndWaitLoaded();
    await waitFor(() => expect(screen.getByText(/ふるさと納税 上限額/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole('button', { name: '印刷' }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('印刷対象外の要素(ヘッダー・年度切替コントロール)にno-printクラスが付与される(FR-20完了条件)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    await renderAppAndWaitLoaded();
    await waitFor(() => expect(screen.getByText(/ふるさと納税 上限額/)).toBeInTheDocument());

    expect(screen.getByRole('banner')).toHaveClass('no-print');
    expect(screen.getByRole('button', { name: '印刷' }).closest('.no-print')).not.toBeNull();
  });

  it('税制パラメータの最終確認日から1年以上経過していると起動画面に警告が出る(R-01)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    // 2026.jsonのverifiedAtは2026-07-26。2年後の時点では未確認期間が1年を超える
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(2028, 0, 1));
      await renderAppAndWaitLoaded();
      await waitFor(() => expect(screen.getByText(/税制パラメータは最終確認日/)).toBeInTheDocument());
      expect(screen.getByText(/税制パラメータは最終確認日/)).toHaveTextContent('2026-07-26');

      await userEvent.click(screen.getByRole('button', { name: '出典を確認' }));
      await waitFor(() => expect(screen.getByRole('heading', { name: /計算明細/ })).toBeInTheDocument());
    } finally {
      vi.useRealTimers();
    }
  });

  it('最終確認日から1年以内なら陳腐化の警告は出ない', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    await flushNow();

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date(2026, 11, 1));
      await renderAppAndWaitLoaded();
      await waitFor(() => expect(screen.getByText(/ふるさと納税 上限額/)).toBeInTheDocument());
      expect(screen.queryByText(/税制パラメータは最終確認日/)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('安全率スライダーを変更すると推奨額が再計算される(FR-13「安全率は変更可」)', async () => {
    installStoragePersistMock();
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({ otherSalaryIncome: 6_000_000 });
    await flushNow();

    await renderAppAndWaitLoaded();
    await waitFor(() => expect(screen.getByText(/推奨額\(安全率90%\)/)).toBeInTheDocument());
    const limitAmount = useAppStore.getState().calculationResult!.furusato.limitAmount;
    const before = useAppStore.getState().calculationResult!.furusato.recommendedAmount;

    fireEvent.change(screen.getByLabelText(/安全率/), { target: { value: '70' } });

    await waitFor(() => expect(screen.getByText(/推奨額\(安全率70%\)/)).toBeInTheDocument());
    const after = useAppStore.getState().calculationResult!.furusato.recommendedAmount;
    expect(useAppStore.getState().appData!.persons[0].years[2026].furusato.safetyRatio).toBeCloseTo(0.7, 6);
    expect(after).toBeLessThan(before);
    // 上限額(安全率を掛ける前の値)は変わらない
    expect(useAppStore.getState().calculationResult!.furusato.limitAmount).toBe(limitAmount);
    // 金額はspanで分割されているため、行全体のtextContentで照合する
    expect(screen.getByText(/推奨額\(安全率70%\)/)).toHaveTextContent(`推奨額(安全率70%) ${after.toLocaleString()}円`);
  });
});
