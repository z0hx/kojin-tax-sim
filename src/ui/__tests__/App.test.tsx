// @vitest-environment jsdom
/**
 * App.tsx〜共通ヘッダー〜S-10人物管理画面までを実際のZustandストア(シングルトン)・IndexedDB(fake-indexeddb)を
 * 通して検証する統合テスト。useAppStore/useNavigationはモジュール単位のシングルトンのため、各テストの前に
 * 明示的に初期状態へ戻す(store/__tests__/useAppStore.test.tsとは異なりcreateAppStore()で個別インスタンス化できない)。
 * App.tsxのマウント時にloadInitialData()がIndexedDBから読み直すため、事前にstoreへ直接書き込んだ状態は
 * render前にflushNow()で確実にDBへ反映させておく必要がある(デバウンス保存が終わっていないと空の状態で上書きされる)。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const { saveBlobMock } = vi.hoisted(() => ({ saveBlobMock: vi.fn(async () => {}) }));
vi.mock('../../persistence/exporter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../persistence/exporter')>();
  return { ...actual, saveBlob: saveBlobMock };
});

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
  saveBlobMock.mockClear();
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

async function openPersonManagement() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: '人物管理' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: '人物管理' })).toBeInTheDocument());
  return screen.getByRole('heading', { name: '人物管理' }).closest('main') as HTMLElement;
}

describe('App(人物プロファイル管理)', () => {
  it('人物が0件の場合はS-12オンボーディングが表示され、3ステップ完了すると共通ヘッダーが現れる', async () => {
    const { persist } = installStoragePersistMock();
    await renderAppAndWaitLoaded();

    // ステップ1: 保存方式の説明
    expect(screen.getByRole('heading', { name: 'データの保存方法について' })).toBeInTheDocument();
    expect(screen.getByText('外部に送信されません', { exact: false })).toBeInTheDocument();
    // NFR-09: 免責表示はonboarding中の画面でも表示される
    expect(screen.getByText('税務上の助言ではありません', { exact: false })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));

    // ステップ2: 人物の作成
    expect(screen.getByRole('heading', { name: '人物を作成' })).toBeInTheDocument();
    const nameInput = screen.getByLabelText('表示名');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '本人');
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));

    // ステップ3: 自治体の設定
    expect(screen.getByRole('heading', { name: '自治体を設定' })).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('都道府県'), '神奈川県');
    await userEvent.type(screen.getByLabelText('市区町村'), '横浜市');
    await userEvent.click(screen.getByRole('button', { name: '完了' }));

    await waitFor(() => expect(screen.getByRole('button', { name: /本人/ })).toBeInTheDocument());
    expect(useAppStore.getState().onboardingRequired).toBe(false);
    expect(useAppStore.getState().appData!.appSettings.onboardingCompleted).toBe(true);
    const person = useAppStore.getState().appData!.persons[0];
    expect(person.defaults.municipality.prefectureName).toBe('神奈川県');
    expect(person.defaults.municipality.name).toBe('横浜市');
    await waitFor(() => expect(persist).toHaveBeenCalledTimes(1));
  });

  it('オンボーディングのステップ2で表示名が未入力だと次へ進めない', async () => {
    installStoragePersistMock();
    await renderAppAndWaitLoaded();
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));

    const nameInput = screen.getByLabelText('表示名');
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));

    expect(screen.getByRole('heading', { name: '人物を作成' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('表示名を入力してください');
  });

  it('オンボーディングのステップ3で戻ると入力済みの表示名が保持される', async () => {
    installStoragePersistMock();
    await renderAppAndWaitLoaded();
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));
    const nameInput = screen.getByLabelText('表示名');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, '配偶者');
    await userEvent.click(screen.getByRole('button', { name: '次へ' }));

    await userEvent.click(screen.getByRole('button', { name: '戻る' }));
    expect(screen.getByLabelText('表示名')).toHaveValue('配偶者');
  });

  it('人物管理画面で人物を追加すると一覧に表示され、切り替えても互いのデータが混線しない(T-23相当)', async () => {
    useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().updateIncome({ otherSalaryIncome: 1_000_000 });
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openPersonManagement();

    await userEvent.type(within(main).getByPlaceholderText('例: 配偶者'), '配偶者');
    await userEvent.click(within(main).getByRole('button', { name: '＋ 人物を追加' }));

    await waitFor(() => expect(within(main).getByText('配偶者')).toBeInTheDocument());
    const personIdA = useAppStore.getState().appData!.persons.find((p) => p.displayName === '本人')!.id;
    const personIdB = useAppStore.getState().appData!.persons.find((p) => p.displayName === '配偶者')!.id;

    // 配偶者(idB)がアクティブになっているはず(addPersonの仕様)。本人(idA)の年度データは変更されていない
    expect(useAppStore.getState().activePersonId).toBe(personIdB);
    const personA = useAppStore.getState().appData!.persons.find((p) => p.id === personIdA)!;
    expect(personA.years[2026]?.income.otherSalaryIncome).toBe(1_000_000);
  });

  it('人物削除は確認ダイアログで件数を示し、確認後に単一人物分のバックアップをエクスポートしてから削除する', async () => {
    const idA = useAppStore.getState().addPerson('本人', '#111111');
    await useAppStore.getState().createBlankYear(2026);
    useAppStore.getState().addPerson('配偶者', '#222222');
    await useAppStore.getState().setActivePerson(idA);
    await flushNow();

    await renderAppAndWaitLoaded();
    const main = await openPersonManagement();

    const nameButtonA = within(main).getByRole('button', { name: '本人' });
    const cardA = nameButtonA.closest('div')!.parentElement!;
    await userEvent.click(within(cardA).getByRole('button', { name: '削除' }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('本人');
    expect(dialog).toHaveTextContent('1年分');

    await userEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(saveBlobMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().appData!.persons.map((p) => p.id)).not.toContain(idA);
  });

  it('バックアップの保存がキャンセルされた場合は削除せずエラーメッセージを表示する', async () => {
    const idA = useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();
    saveBlobMock.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));

    await renderAppAndWaitLoaded();
    const main = await openPersonManagement();

    await userEvent.click(within(main).getByRole('button', { name: '削除' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: '削除する' }));

    await waitFor(() => expect(within(main).getByRole('alert')).toHaveTextContent('キャンセル'));
    expect(useAppStore.getState().appData!.persons.map((p) => p.id)).toContain(idA);
  });
});
