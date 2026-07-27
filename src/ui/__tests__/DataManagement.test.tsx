// @vitest-environment jsdom
/**
 * S-09 データ管理画面の統合テスト。App.test.tsxと同様、実際のZustandストア(シングルトン)・
 * IndexedDB(fake-indexeddb)を通して検証する。ロジック自体(persistence層・store層)は既存テストで
 * 検証済みのため、ここでは画面からの結線(入力→store呼び出し→画面表示への反映)を中心に確認する。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';

const { saveBlobMock } = vi.hoisted(() => ({ saveBlobMock: vi.fn(async (_blob: Blob, _filename: string) => {}) }));
vi.mock('../../persistence/exporter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../persistence/exporter')>();
  return { ...actual, saveBlob: saveBlobMock };
});

import App from '../../App';
import { useAppStore, initialState } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { clearAppData, saveAppData } from '../../persistence/repository';
import { flushNow, resetSaveQueueForTests } from '../../store/saveQueue';
import { CURRENT_SCHEMA_VERSION } from '../../persistence/migration';
import { emptyAppData, type AppData } from '../../persistence/types';
import {
  installMemoryLocalStorage,
  installStoragePersistMock,
  stubFetchForTaxParams,
  uninstallMemoryLocalStorage,
  uninstallStoragePersistMock,
  yokohamaMunicipality,
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

async function openDataManagement() {
  await userEvent.click(screen.getByRole('button', { name: '設定' }));
  await userEvent.click(screen.getByRole('menuitem', { name: 'データ管理' }));
  await waitFor(() => expect(screen.getByRole('heading', { name: 'データ管理' })).toBeInTheDocument());
  return screen.getByRole('heading', { name: 'データ管理' }).closest('main') as HTMLElement;
}

function makeAppDataFile(data: AppData, name = 'import.json'): File {
  return new File([JSON.stringify(data)], name, { type: 'application/json' });
}

describe('DataManagementScreen(S-09)', () => {
  it('設定メニューから開ける', async () => {
    useAppStore.getState().addPerson('本人', '#111111');
    await flushNow();
    installStoragePersistMock();
    await renderAppAndWaitLoaded();
    await openDataManagement();
  });

  describe('保存状態', () => {
    it('使用量/見積上限を表示し、未許可なら「永続化を許可する」ボタンで要求できる', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      const { persist } = installStoragePersistMock(true, { usage: 419_430, quota: 2_147_483_648 });
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await waitFor(() => expect(within(main).getByText(/0\.4 MB/)).toBeInTheDocument());
      expect(within(main).getByText(/2048\.0 MB/)).toBeInTheDocument();
      expect(within(main).getByText('永続化: 未確認')).toBeInTheDocument();

      await userEvent.click(within(main).getByRole('button', { name: '永続化を許可する' }));
      expect(persist).toHaveBeenCalledTimes(1);
      await waitFor(() => expect(within(main).getByText('永続化: 許可済み')).toBeInTheDocument());
      expect(within(main).queryByRole('button', { name: '永続化を許可する' })).not.toBeInTheDocument();
    });
  });

  describe('エクスポート', () => {
    it('全員選択・非暗号化でエクスポートすると平文の警告が出て、最終エクスポート日時が更新される', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      expect(within(main).getByText('所得情報を含む平文ファイルです。取り扱いにご注意ください。')).toBeInTheDocument();
      await userEvent.click(within(main).getByRole('button', { name: 'エクスポート' }));

      await waitFor(() => expect(saveBlobMock).toHaveBeenCalledTimes(1));
      expect(useAppStore.getState().appData!.appSettings.lastExportedAt).not.toBeNull();
      await waitFor(() => expect(within(main).getByText(/最終エクスポート: /)).toHaveTextContent('0日前'));
    });

    it('対象人物のチェックを全て外すとエクスポートボタンが無効化され警告が出る', async () => {
      const idA = useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.click(within(main).getByRole('checkbox', { name: '本人' }));
      expect(within(main).getByRole('button', { name: 'エクスポート' })).toBeDisabled();
      expect(within(main).getByText('エクスポート対象の人物を1人以上選択してください。')).toBeInTheDocument();
      expect(idA).toBeTruthy();
    });

    it('暗号化を選択してもパスフレーズが空だとエクスポートボタンが無効化される', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.click(within(main).getByRole('checkbox', { name: 'パスフレーズで暗号化する' }));
      expect(within(main).getByRole('button', { name: 'エクスポート' })).toBeDisabled();
      expect(within(main).getByText('パスフレーズを入力してください。')).toBeInTheDocument();

      await userEvent.type(within(main).getByLabelText('パスフレーズ'), 'correct horse battery staple');
      expect(within(main).getByRole('button', { name: 'エクスポート' })).toBeEnabled();
    });

    it('置換インポート後は選択が新しい人物構成に合わせて無効化され、無警告の0件エクスポートが起きない(レビューで発見の回帰テスト)', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      const incoming: AppData = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        persons: [
          {
            id: 'replaced-1',
            displayName: '置換後太郎',
            color: '#abcdef',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            years: {},
            defaults: { municipality: yokohamaMunicipality(), safetyRatio: 0.9 },
          },
        ],
        activePersonId: null,
        appSettings: emptyAppData().appSettings,
      };

      await userEvent.upload(within(main).getByLabelText('ファイルを選択'), makeAppDataFile(incoming));
      await userEvent.click(within(main).getByLabelText(/置換 —/));
      await userEvent.click(within(main).getByRole('button', { name: 'プレビュー' }));
      await waitFor(() => expect(within(main).getByRole('button', { name: 'インポートを実行' })).toBeInTheDocument());
      await userEvent.click(within(main).getByRole('button', { name: 'インポートを実行' }));

      await waitFor(() => expect(within(main).getByRole('checkbox', { name: '置換後太郎' })).toBeInTheDocument());

      // 元の「本人」を選択していた古いidはもう存在しないため対象人物選択は空扱いになり、エクスポートは無効化される
      expect(within(main).getByRole('button', { name: 'エクスポート' })).toBeDisabled();
      expect(within(main).getByText('エクスポート対象の人物を1人以上選択してください。')).toBeInTheDocument();
      // 置換前の自動バックアップの1回のみで、誤った0件エクスポートは行われていない
      expect(saveBlobMock).toHaveBeenCalledTimes(1);
    });

    it('個別選択時はファイル名に選択した人物の表示名が使われる(UUIDが露出しない)', async () => {
      const idA = useAppStore.getState().addPerson('本人', '#111111');
      useAppStore.getState().addPerson('配偶者', '#222222');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.click(within(main).getByRole('checkbox', { name: '配偶者' }));
      await userEvent.click(within(main).getByRole('button', { name: 'エクスポート' }));

      await waitFor(() => expect(saveBlobMock).toHaveBeenCalledTimes(1));
      const filename = saveBlobMock.mock.calls[0][1] as string;
      expect(filename).toContain('本人');
      expect(filename).not.toContain(idA);
    });
  });

  describe('バックアップ督促(FR-28)', () => {
    it('一度もエクスポートしていない場合は警告を表示する', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      expect(within(main).getByText(/まだエクスポートしていません/)).toBeInTheDocument();
      expect(within(main).getByText('⚠ バックアップをおすすめします')).toBeInTheDocument();
    });

    it('最終エクスポートから30日未満なら警告を表示しない', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      const current = useAppStore.getState().appData!;
      await saveAppData({
        ...current,
        appSettings: { ...current.appSettings, lastExportedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() },
      });
      useAppStore.setState(initialState());

      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      expect(within(main).getByText(/5日前/)).toBeInTheDocument();
      expect(within(main).queryByText('⚠ バックアップをおすすめします')).not.toBeInTheDocument();
    });

    it('最終エクスポートから30日以上経過していると警告を表示する', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      const current = useAppStore.getState().appData!;
      await saveAppData({
        ...current,
        appSettings: { ...current.appSettings, lastExportedAt: new Date(Date.now() - 31 * 86_400_000).toISOString() },
      });
      useAppStore.setState(initialState());

      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      expect(within(main).getByText(/31日前/)).toBeInTheDocument();
      expect(within(main).getByText('⚠ バックアップをおすすめします')).toBeInTheDocument();
    });
  });

  describe('インポート', () => {
    function buildIncoming(): AppData {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        persons: [
          {
            id: 'imported-1',
            displayName: 'インポート太郎',
            color: '#abcdef',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            years: {},
            defaults: { municipality: yokohamaMunicipality(), safetyRatio: 0.9 },
          },
        ],
        activePersonId: null,
        appSettings: emptyAppData().appSettings,
      };
    }

    it('プレビュー→実行(addAsNew)で人物が追加され、完了メッセージが表示される', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.upload(within(main).getByLabelText('ファイルを選択'), makeAppDataFile(buildIncoming()));
      await userEvent.click(within(main).getByLabelText('新規追加 — 全人物を新しいIDで追加する'));
      await userEvent.click(within(main).getByRole('button', { name: 'プレビュー' }));

      await waitFor(() => expect(within(main).getByText(/追加される人物 1件/)).toBeInTheDocument());
      expect(within(main).getByText(/インポート太郎/)).toBeInTheDocument();

      await userEvent.click(within(main).getByRole('button', { name: 'インポートを実行' }));

      await waitFor(() => expect(within(main).getByText('インポートが完了しました。')).toBeInTheDocument());
      expect(useAppStore.getState().appData!.persons.map((p) => p.displayName)).toContain('インポート太郎');
      expect(within(main).queryByText(/追加される人物/)).not.toBeInTheDocument();
    });

    it('キャンセルするとプレビューが消え、データは変更されない', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.upload(within(main).getByLabelText('ファイルを選択'), makeAppDataFile(buildIncoming()));
      await userEvent.click(within(main).getByRole('button', { name: 'プレビュー' }));
      await waitFor(() => expect(within(main).getByText(/追加される人物 1件/)).toBeInTheDocument());

      await userEvent.click(within(main).getByRole('button', { name: 'キャンセル' }));

      expect(within(main).queryByText(/追加される人物/)).not.toBeInTheDocument();
      expect(useAppStore.getState().appData!.persons.map((p) => p.displayName)).not.toContain('インポート太郎');
    });

    it('置換モードでは事前バックアップの注記が表示され、実行するとバックアップがダウンロードされる', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.upload(within(main).getByLabelText('ファイルを選択'), makeAppDataFile(buildIncoming()));
      await userEvent.click(within(main).getByLabelText(/置換 —/));
      await userEvent.click(within(main).getByRole('button', { name: 'プレビュー' }));

      await waitFor(() =>
        expect(
          within(main).getByText('置換を実行すると、まず現在のデータを自動的にバックアップとしてダウンロードしてから置き換えます。')
        ).toBeInTheDocument()
      );

      await userEvent.click(within(main).getByRole('button', { name: 'インポートを実行' }));

      await waitFor(() => expect(saveBlobMock).toHaveBeenCalledTimes(1));
      expect(useAppStore.getState().appData!.persons.map((p) => p.displayName)).toContain('インポート太郎');
    });

    it('マージで更新される人物には変更年度が併記される(S-09ワイヤーフレームの「└ 2026年分」相当)', async () => {
      const idA = useAppStore.getState().addPerson('本人', '#111111');
      await useAppStore.getState().createBlankYear(2026);
      await flushNow();

      const existing = useAppStore.getState().appData!.persons.find((p) => p.id === idA)!;
      const changedPerson = structuredClone(existing);
      changedPerson.updatedAt = new Date(Date.now() + 60_000).toISOString();
      changedPerson.years[2026] = { ...changedPerson.years[2026], income: { ...changedPerson.years[2026].income, otherSalaryIncome: 500_000 } };
      const incoming: AppData = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        persons: [changedPerson],
        activePersonId: null,
        appSettings: emptyAppData().appSettings,
      };

      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.upload(within(main).getByLabelText('ファイルを選択'), makeAppDataFile(incoming));
      await userEvent.click(within(main).getByRole('button', { name: 'プレビュー' }));

      await waitFor(() => expect(within(main).getByText(/更新される人物 1件/)).toBeInTheDocument());
      expect(within(main).getByText(/本人\(2026年分\)/)).toBeInTheDocument();
    });

    it('不正なファイルを選択するとエラーバナーが表示される', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.upload(within(main).getByLabelText('ファイルを選択'), new File(['not json'], 'bad.json', { type: 'application/json' }));
      await userEvent.click(within(main).getByRole('button', { name: 'プレビュー' }));

      await waitFor(() => expect(within(main).getByText(/JSONとして解釈できません/)).toBeInTheDocument());
    });
  });

  describe('全データ削除', () => {
    it('「削除」と入力するまで確認ボタンが無効で、入力後の実行で全データが消えオンボーディングに戻る', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.click(within(main).getByRole('button', { name: '全データを削除' }));
      const dialog = await screen.findByRole('dialog');
      expect(within(dialog).getByRole('button', { name: '完全に削除する' })).toBeDisabled();

      await userEvent.type(within(dialog).getByLabelText('続行するには「削除」と入力してください'), '削除');
      await userEvent.click(within(dialog).getByRole('button', { name: '完全に削除する' }));

      await waitFor(() => expect(screen.getByRole('heading', { name: 'データの保存方法について' })).toBeInTheDocument());
      expect(useAppStore.getState().appData!.persons).toEqual([]);
      expect(useAppStore.getState().onboardingRequired).toBe(true);
    });

    it('キャンセルすると何も削除されない', async () => {
      useAppStore.getState().addPerson('本人', '#111111');
      await flushNow();
      installStoragePersistMock();
      await renderAppAndWaitLoaded();
      const main = await openDataManagement();

      await userEvent.click(within(main).getByRole('button', { name: '全データを削除' }));
      const dialog = await screen.findByRole('dialog');
      await userEvent.click(within(dialog).getByRole('button', { name: 'キャンセル' }));

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(useAppStore.getState().appData!.persons).toHaveLength(1);
    });
  });
});
