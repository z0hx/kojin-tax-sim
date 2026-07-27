import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** exporter.saveBlobはwindow/document依存のため、DOM無し(environment:'node')でも走るようスタブする(レビュー指摘Medium#7是正) */
const { saveBlobMock } = vi.hoisted(() => ({ saveBlobMock: vi.fn(async (_blob: Blob, _filename: string) => {}) }));
vi.mock('../../persistence/exporter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../persistence/exporter')>();
  return { ...actual, saveBlob: saveBlobMock };
});

import { clearAppData, loadAppData } from '../../persistence/repository';
import { resetDbConnectionForTests } from '../../persistence/db';
import { resetSaveQueueForTests, flushNow } from '../saveQueue';
import { createAppStore, DEFAULT_MUNICIPALITY } from '../useAppStore';
import { installMemoryLocalStorage, stubFetchForTaxParams, uninstallMemoryLocalStorage, yokohamaMunicipality } from './testUtils';
import { CURRENT_SCHEMA_VERSION } from '../../persistence/migration';
import { emptyAppData, type AppData } from '../../persistence/types';
import { TaxParamsError } from '../../taxParams/loader';
import { loadUiSettings, saveUiSettings } from '../../persistence/settings';

function monthly(gross: number, social: number) {
  return Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    status: 'actual' as const,
    grossSalary: gross,
    socialInsurance: social,
    isSocialInsuranceExempt: false,
  }));
}

describe('useAppStore', () => {
  let store: ReturnType<typeof createAppStore>;

  beforeEach(async () => {
    await clearAppData();
    resetSaveQueueForTests();
    installMemoryLocalStorage();
    stubFetchForTaxParams();
    saveBlobMock.mockClear();
    store = createAppStore();
  });

  afterEach(() => {
    uninstallMemoryLocalStorage();
    vi.unstubAllGlobals();
    resetSaveQueueForTests();
  });

  describe('loadInitialData', () => {
    it('データが無い場合はonboardingRequired=trueで空のappDataになる', async () => {
      await store.getState().loadInitialData();
      const s = store.getState();
      expect(s.onboardingRequired).toBe(true);
      expect(s.appData?.persons).toEqual([]);
      expect(s.isLoading).toBe(false);
      expect(s.calculationResult).toBeNull();
    });

    it('保存済みデータがあれば読み込み、最新年度をactiveYearにしてcalculationResultを計算する', async () => {
      const setupStore = createAppStore();
      const personId = setupStore.getState().addPerson('本人', '#336699');
      await setupStore.getState().createBlankYear(2025);
      await setupStore.getState().createBlankYear(2026);
      await flushNow();

      await store.getState().loadInitialData();
      const s = store.getState();
      expect(s.onboardingRequired).toBe(false);
      expect(s.activePersonId).toBe(personId);
      expect(s.activeYear).toBe(2026); // 最新年度
      expect(s.calculationResult).not.toBeNull();
    });
  });

  describe('addPerson / createBlankYear', () => {
    it('addPerson直後はactiveYearがnullでcalculationResultもnull(クラッシュしない)', () => {
      const id = store.getState().addPerson('本人', '#111111');
      const s = store.getState();
      expect(s.activePersonId).toBe(id);
      expect(s.activeYear).toBeNull();
      expect(s.calculationResult).toBeNull();
      expect(s.onboardingRequired).toBe(false);
    });

    it('createBlankYearで年度を作成すると再計算される', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      const s = store.getState();
      expect(s.activeYear).toBe(2026);
      expect(s.calculationResult).not.toBeNull();
      expect(s.calculationResult?.furusato.limitAmount).toBe(0); // 収入0なので上限も0
    });

    it('municipalityを渡すとその人物のdefaults.municipalityに反映される', () => {
      const id = store.getState().addPerson('本人', '#111111', yokohamaMunicipality());
      const person = store.getState().appData!.persons.find((p) => p.id === id)!;
      expect(person.defaults.municipality).toEqual(yokohamaMunicipality());
    });

    it('municipalityを省略した場合は標準税率(DEFAULT_MUNICIPALITY)になる', () => {
      const id = store.getState().addPerson('本人', '#111111');
      const person = store.getState().appData!.persons.find((p) => p.id === id)!;
      expect(person.defaults.municipality).toEqual(DEFAULT_MUNICIPALITY);
    });
  });

  describe('completeOnboarding(S-12オンボーディング完了)', () => {
    it('人物を作成し、渡した自治体設定をdefaultsに反映し、appSettings.onboardingCompletedをtrueにする', async () => {
      const id = await store.getState().completeOnboarding('本人', '#3366cc', yokohamaMunicipality());
      const s = store.getState();
      expect(s.activePersonId).toBe(id);
      expect(s.onboardingRequired).toBe(false);
      expect(s.appData!.appSettings.onboardingCompleted).toBe(true);
      const person = s.appData!.persons.find((p) => p.id === id)!;
      expect(person.defaults.municipality).toEqual(yokohamaMunicipality());
    });

    it('完了後は即座にIndexedDBへ保存される(デバウンス待ちを挟まなくても再読み込みで復元できる)', async () => {
      await store.getState().completeOnboarding('本人', '#3366cc', yokohamaMunicipality());
      // flushNow()を挟まずに直接再読み込みする。completeOnboarding内部でflushNow相当の即時保存が
      // 行われていなければ、この時点でIndexedDBにはまだ書き込まれておらず読み込み結果が空になる
      const reloaded = await loadAppData();
      expect(reloaded?.persons).toHaveLength(1);
      expect(reloaded?.appSettings.onboardingCompleted).toBe(true);
    });
  });

  describe('update*系のガード(レビュー指摘 Medium是正: YearProfile未作成時にクラッシュしない)', () => {
    it('activeYearが無い状態でupdateIncomeを呼んでもクラッシュせずno-opになる', () => {
      store.getState().addPerson('本人', '#111111');
      expect(() => store.getState().updateIncome({ otherSalaryIncome: 5_000_000 })).not.toThrow();
      expect(store.getState().appData?.persons[0].years).toEqual({});
    });
  });

  describe('updateIncome / 再計算とデバウンス保存', () => {
    it('updateIncomeで即座にcalculationResultが更新され、saveQueueにスケジュールされる', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      const before = store.getState().calculationResult;

      store.getState().updateIncome({ otherSalaryIncome: 5_000_000, monthly: monthly(0, 0) });
      const after = store.getState().calculationResult;
      expect(after).not.toBe(before);
      expect(after?.income.grossTotal).toBe(5_000_000);

      await flushNow();
      const persisted = await loadAppData();
      expect(persisted?.persons[0].years[2026]?.income.otherSalaryIncome).toBe(5_000_000);
    });

    it('配列フィールド(monthly)はパッチに含めた場合、丸ごと置換される(マージ規約の確認)', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      const partial = [{ month: 1, status: 'actual' as const, grossSalary: 500_000, socialInsurance: 0, isSocialInsuranceExempt: false }];
      store.getState().updateIncome({ monthly: partial });
      const profile = store.getState().appData!.persons[0].years[2026];
      // 12ヶ月分の配列を1要素の配列で置き換えると、丸ごと置換されて1要素になる(部分マージではない)
      expect(profile.income.monthly).toHaveLength(1);
      expect(profile.income.monthly).toEqual(partial);
    });
  });

  describe('人物の分離(T-23相当)', () => {
    it('人物Aの変更が人物Bのデータに影響しない', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      store.getState().updateIncome({ otherSalaryIncome: 3_000_000 });

      const idB = store.getState().addPerson('配偶者', '#222222');
      await store.getState().createBlankYear(2026);
      store.getState().updateIncome({ otherSalaryIncome: 8_000_000 });

      const dataAfter = store.getState().appData!;
      const personA = dataAfter.persons.find((p) => p.id === idA)!;
      const personB = dataAfter.persons.find((p) => p.id === idB)!;
      expect(personA.years[2026].income.otherSalaryIncome).toBe(3_000_000);
      expect(personB.years[2026].income.otherSalaryIncome).toBe(8_000_000);
    });
  });

  describe('setActivePerson / setActiveYear', () => {
    it('切替前にflushNowが呼ばれ、保留中の変更が保存されてから切り替わる', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      store.getState().updateIncome({ otherSalaryIncome: 4_000_000 }); // まだデバウンス待ち、保存されていない

      const idB = store.getState().addPerson('配偶者', '#222222');
      await store.getState().createBlankYear(2026);

      await store.getState().setActivePerson(idA); // flushNowが実行される

      const persisted = await loadAppData();
      const personA = persisted?.persons.find((p) => p.id === idA);
      expect(personA?.years[2026]?.income.otherSalaryIncome).toBe(4_000_000);
      expect(store.getState().activePersonId).toBe(idA);

      void idB;
    });

    it('YearProfileが存在しない年度への切替はクラッシュせずcalculationResultがnullになる', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      await store.getState().setActiveYear(2099);
      const s = store.getState();
      expect(s.activeYear).toBe(2099);
      expect(s.calculationResult).toBeNull();
    });

    it('切替後、永続化されるappData.activePersonIdも新しい人物に更新される(レビュー指摘是正: 食い違い防止)', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      store.getState().addPerson('配偶者', '#222222'); // これがactiveになる
      await store.getState().createBlankYear(2026);

      await store.getState().setActivePerson(idA);
      await flushNow();

      const persisted = await loadAppData();
      expect(persisted?.activePersonId).toBe(idA);
    });

    it('loadInitialDataはappData.activePersonIdとlocalStorageが食い違う場合、localStorage側を優先する(デバウンス保存のラグ対策)', async () => {
      const setupStore = createAppStore();
      const idA = setupStore.getState().addPerson('本人', '#111111');
      await setupStore.getState().createBlankYear(2026);
      setupStore.getState().addPerson('配偶者', '#222222');
      await setupStore.getState().createBlankYear(2026);
      await flushNow(); // この時点でappData.activePersonIdは配偶者側になっている

      // idAへ切り替えた直後にタブが閉じた状況を模擬する: localStorageだけが先に進んでいる
      saveUiSettings({ ...loadUiSettings(), lastActivePersonId: idA, lastActiveYear: 2026 });

      await store.getState().loadInitialData();
      expect(store.getState().activePersonId).toBe(idA);
    });
  });

  describe('copyYearFromPrevious', () => {
    it('前年データがあればコピーし、寄附額のみ0にリセットする', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2025);
      store.getState().updateIncome({ otherSalaryIncome: 6_000_000 });
      store.getState().updateFurusatoInput({ donatedAmount: 50_000 });

      await store.getState().copyYearFromPrevious(2026);
      const profile = store.getState().appData!.persons[0].years[2026];
      expect(profile.income.otherSalaryIncome).toBe(6_000_000);
      expect(profile.furusato.donatedAmount).toBe(0);
    });

    it('前年データが無ければcreateBlankYear相当にフォールバックする(クラッシュしない)', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().copyYearFromPrevious(2026); // 2025年分は存在しない
      const s = store.getState();
      expect(s.activeYear).toBe(2026);
      expect(s.appData!.persons[0].years[2026]).toBeDefined();
      expect(s.calculationResult).not.toBeNull();
    });
  });

  describe('deletePerson', () => {
    it('アクティブでない人物を削除してもactivePersonIdは変わらない', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      const idB = store.getState().addPerson('配偶者', '#222222');
      store.getState().deletePerson(idA);
      expect(store.getState().activePersonId).toBe(idB);
      expect(store.getState().appData!.persons).toHaveLength(1);
    });

    it('アクティブな人物を削除するとフォールバック人物に切り替わる(T-24相当)', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      store.getState().addPerson('配偶者', '#222222'); // これがactiveになる
      await store.getState().setActivePerson(idA);

      store.getState().deletePerson(idA);
      const s = store.getState();
      expect(s.appData!.persons.find((p) => p.id === idA)).toBeUndefined();
      expect(s.activePersonId).not.toBe(idA);
    });

    it('全員削除するとactivePersonId/activeYearがnullになりonboardingRequiredがtrueになる', () => {
      const idA = store.getState().addPerson('本人', '#111111');
      store.getState().deletePerson(idA);
      const s = store.getState();
      expect(s.activePersonId).toBeNull();
      expect(s.activeYear).toBeNull();
      expect(s.calculationResult).toBeNull();
      expect(s.onboardingRequired).toBe(true);
    });

    it('人物が残っている場合はonboardingRequiredはfalseのまま', () => {
      store.getState().addPerson('本人', '#111111');
      const idB = store.getState().addPerson('配偶者', '#222222');
      store.getState().deletePerson(idB);
      expect(store.getState().onboardingRequired).toBe(false);
    });
  });

  describe('duplicatePerson', () => {
    it('年度データを含めて複製し、activePersonIdは変更しない', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      store.getState().updateIncome({ otherSalaryIncome: 1_000_000 });

      const cloneId = store.getState().duplicatePerson(idA);
      const s = store.getState();
      expect(cloneId).not.toBe(idA);
      expect(s.activePersonId).toBe(idA); // 切り替わらない
      const clone = s.appData!.persons.find((p) => p.id === cloneId)!;
      expect(clone.displayName).toBe('本人');
      expect(clone.years[2026]?.income.otherSalaryIncome).toBe(1_000_000);
      expect(s.appData!.persons).toHaveLength(2);
    });

    it('複製後に元の人物を変更しても複製先の値は変わらない(T-23相当・イミュータブル)', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      const cloneId = store.getState().duplicatePerson(idA);

      store.getState().updateIncome({ otherSalaryIncome: 9_999_999 });

      const s = store.getState();
      const clone = s.appData!.persons.find((p) => p.id === cloneId)!;
      expect(clone.years[2026]?.income.otherSalaryIncome).toBe(0);
    });
  });

  describe('deletePersonWithBackup', () => {
    it('バックアップに成功した場合のみ削除し、単一人物分をエクスポートする', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      const idB = store.getState().addPerson('配偶者', '#222222');
      await store.getState().setActivePerson(idA);

      await store.getState().deletePersonWithBackup(idA);

      const s = store.getState();
      expect(s.appData!.persons.map((p) => p.id)).toEqual([idB]);
      expect(s.appData!.persons.find((p) => p.id === idA)).toBeUndefined();
      expect(saveBlobMock).toHaveBeenCalledTimes(1);
      expect(s.lastError).toBeNull();

      const persisted = await loadAppData();
      expect(persisted?.persons.map((p) => p.id)).toEqual([idB]);
    });

    it('最後の1人を削除するとonboardingRequiredがtrueになる', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      await store.getState().deletePersonWithBackup(idA);
      const s = store.getState();
      expect(s.onboardingRequired).toBe(true);
      expect(s.appData!.persons).toEqual([]);
    });

    it('バックアップに失敗した場合は削除せずlastErrorをセットする', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      saveBlobMock.mockRejectedValueOnce(new Error('disk full'));

      await store.getState().deletePersonWithBackup(idA);

      const s = store.getState();
      expect(s.appData!.persons.map((p) => p.id)).toEqual([idA]);
      expect(s.lastError).not.toBeNull();
    });

    it('保存ダイアログのキャンセル(AbortError)でも削除せず、その旨のメッセージをセットする', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      const abortError = new DOMException('The user aborted a request.', 'AbortError');
      saveBlobMock.mockRejectedValueOnce(abortError);

      await store.getState().deletePersonWithBackup(idA);

      const s = store.getState();
      expect(s.appData!.persons.map((p) => p.id)).toEqual([idA]);
      expect(s.lastError?.message).toContain('キャンセル');
    });

    it('バックアップ待機中に他の変更が入っても、その変更を上書きせずに削除する(レビューで発見: lost update是正)', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      const idB = store.getState().addPerson('配偶者', '#222222');

      let resolveBackup!: () => void;
      const backupPromise = new Promise<void>((resolve) => {
        resolveBackup = resolve;
      });
      saveBlobMock.mockImplementationOnce(() => backupPromise);

      const deletion = store.getState().deletePersonWithBackup(idA);
      // deletePersonWithBackupがsaveBlobの完了を待っている間に、別の人物への変更を割り込ませる
      store.getState().renamePerson(idB, '配偶者リネーム');

      resolveBackup();
      await deletion;

      const s = store.getState();
      expect(s.appData!.persons.map((p) => p.id)).toEqual([idB]);
      expect(s.appData!.persons.find((p) => p.id === idB)?.displayName).toBe('配偶者リネーム');
    });
  });

  describe('exportData', () => {
    it('個別選択時はファイル名に人物の表示名を使う(生のUUIDを埋め込まない、レビューで発見の是正)', async () => {
      const idA = store.getState().addPerson('本人', '#111111');
      store.getState().addPerson('配偶者', '#222222');
      await flushNow();

      await store.getState().exportData({ personIds: [idA], includeSettings: true });

      expect(saveBlobMock).toHaveBeenCalledTimes(1);
      const filename = saveBlobMock.mock.calls[0][1] as string;
      expect(filename).toContain('本人');
      expect(filename).not.toContain(idA);
      expect(store.getState().appData!.appSettings.lastExportedAt).not.toBeNull();
      expect(store.getState().lastError).toBeNull();
    });

    it('対象人物を1人も選択していない場合はエクスポートせずlastErrorをセットする', async () => {
      store.getState().addPerson('本人', '#111111');
      await flushNow();

      await store.getState().exportData({ personIds: [], includeSettings: true });

      expect(saveBlobMock).not.toHaveBeenCalled();
      expect(store.getState().lastError).not.toBeNull();
      expect(store.getState().appData!.appSettings.lastExportedAt).toBeNull();
    });

    it('保存ダイアログのキャンセル(AbortError)の場合はその旨のメッセージをセットする', async () => {
      store.getState().addPerson('本人', '#111111');
      const abortError = new DOMException('The user aborted a request.', 'AbortError');
      saveBlobMock.mockRejectedValueOnce(abortError);

      await store.getState().exportData({ personIds: 'all', includeSettings: true });

      expect(store.getState().lastError?.message).toContain('キャンセル');
      expect(store.getState().appData!.appSettings.lastExportedAt).toBeNull();
    });

    it('存在しないidだけを渡した場合は0件扱いとしてエクスポートせずlastErrorをセットする(レビューで発見: UI側のstale id対策の保険)', async () => {
      store.getState().addPerson('本人', '#111111');
      await flushNow();

      await store.getState().exportData({ personIds: ['no-such-person-id'], includeSettings: true });

      expect(saveBlobMock).not.toHaveBeenCalled();
      expect(store.getState().lastError).not.toBeNull();
      expect(store.getState().appData!.appSettings.lastExportedAt).toBeNull();
    });
  });

  describe('setCapMode', () => {
    it('再計算されない(calculationResultの参照が変わらない)', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      const before = store.getState().calculationResult;
      store.getState().setCapMode('conservative');
      expect(store.getState().calculationResult).toBe(before); // 参照が同一 = 再計算していない
      expect(store.getState().appData?.appSettings.furusatoCapMode).toBe('conservative');
    });
  });

  describe('setSafetyRatio', () => {
    it('推奨額がsafetyRatioに応じて変わる', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      store.getState().updateIncome({ otherSalaryIncome: 6_000_000 });
      const limit = store.getState().calculationResult!.furusato.limitAmount;

      store.getState().setSafetyRatio(0.5);
      const s = store.getState();
      expect(s.appData!.persons[0].years[2026].furusato.safetyRatio).toBe(0.5);
      expect(s.calculationResult!.furusato.recommendedAmount).toBeLessThanOrEqual(limit);
    });
  });

  describe('TaxParamsError(fail closed)', () => {
    it('taxParams取得に失敗した年はcalculationResultがnullのままlastErrorがセットされる', async () => {
      stubFetchForTaxParams({ 2026: 'fail' });
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      const s = store.getState();
      expect(s.calculationResult).toBeNull();
      expect(s.lastError).toBeInstanceOf(TaxParamsError);
    });
  });

  describe('deleteAllData(レビュー指摘 High是正: 保留中の保存によるデータ復活を防ぐ)', () => {
    it('保留中の保存があっても削除後にデータが復活しない', async () => {
      store.getState().addPerson('本人', '#111111');
      await store.getState().createBlankYear(2026);
      store.getState().updateIncome({ otherSalaryIncome: 1_000_000 }); // 500msデバウンス待ちの保存が保留中

      await store.getState().deleteAllData();

      // 保留していたはずのタイマーが後から発火しても復活しないことを確認する
      await new Promise((r) => setTimeout(r, 600));

      const persisted = await loadAppData();
      expect(persisted).toBeNull();
      const s = store.getState();
      expect(s.appData?.persons).toEqual([]);
      expect(s.onboardingRequired).toBe(true);
    });

    it('削除に失敗した場合はlastErrorをセットし、stateは変更しない', async () => {
      const repository = await import('../../persistence/repository');
      const spy = vi.spyOn(repository, 'clearAppData').mockRejectedValueOnce(new Error('quota exceeded'));
      store.getState().addPerson('本人', '#111111');
      const before = store.getState().appData;

      await store.getState().deleteAllData();

      const s = store.getState();
      expect(s.lastError).not.toBeNull();
      expect(s.appData).toBe(before); // 失敗時はstateを変更しない
      spy.mockRestore();
    });
  });

  describe('importer結線(previewImport/commitImport)', () => {
    function makeImportFile(data: AppData): File {
      return new File([JSON.stringify(data)], 'import.json', { type: 'application/json' });
    }

    it('previewImportで差分プレビューが作られ、commitImport(addAsNew)で人物が追加される', async () => {
      store.getState().addPerson('本人', '#111111');

      const incoming: AppData = {
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

      await store.getState().previewImport(makeImportFile(incoming), 'addAsNew');
      const preview = store.getState().importPreview;
      expect(preview?.added).toHaveLength(1);

      await store.getState().commitImport('addAsNew');
      const s = store.getState();
      expect(s.appData!.persons.map((p) => p.displayName)).toContain('インポート太郎');
      expect(s.importPreview).toBeNull();

      const persisted = await loadAppData();
      expect(persisted?.persons.map((p) => p.displayName)).toContain('インポート太郎');
    });

    it('replaceモードのcommitImportは事前にバックアップをダウンロードする', async () => {
      store.getState().addPerson('本人', '#111111');
      const incoming: AppData = { ...emptyAppData(), persons: [] };
      await store.getState().previewImport(makeImportFile(incoming), 'replace');
      await store.getState().commitImport('replace');
      expect(saveBlobMock).toHaveBeenCalled();
    });

    it('不正なファイルはImportErrorをlastErrorにセットし、importPreviewはnullのまま', async () => {
      const badFile = new File(['not json'], 'bad.json', { type: 'application/json' });
      await store.getState().previewImport(badFile, 'merge');
      const s = store.getState();
      expect(s.importPreview).toBeNull();
      expect(s.lastError).not.toBeNull();
    });

    it('replaceモードの事前バックアップがキャンセルされた場合はインポートを中止し、プレビューはやり直せるよう残す', async () => {
      store.getState().addPerson('本人', '#111111');
      const incoming: AppData = { ...emptyAppData(), persons: [] };
      await store.getState().previewImport(makeImportFile(incoming), 'replace');

      const abortError = new DOMException('The user aborted a request.', 'AbortError');
      saveBlobMock.mockRejectedValueOnce(abortError);
      await store.getState().commitImport('replace');

      const s = store.getState();
      expect(s.lastError?.message).toContain('キャンセル');
      expect(s.importPreview).not.toBeNull();
      expect(s.appData!.persons.map((p) => p.displayName)).toContain('本人'); // 中止されデータは変更されていない
    });

    it('cancelImportPreviewでプレビューと保留中の取込データを破棄する', async () => {
      store.getState().addPerson('本人', '#111111');
      const incoming: AppData = { ...emptyAppData(), persons: [] };
      await store.getState().previewImport(makeImportFile(incoming), 'replace');
      expect(store.getState().importPreview).not.toBeNull();

      store.getState().cancelImportPreview();

      const s = store.getState();
      expect(s.importPreview).toBeNull();
      expect(s.pendingImportIncoming).toBeNull();
    });
  });

  describe('requestPersistence / refreshStorageUsage', () => {
    it('navigator.storageが無い環境ではunsupportedになる', async () => {
      vi.stubGlobal('navigator', {});
      await store.getState().requestPersistence();
      expect(store.getState().persistenceState).toBe('unsupported');
      await store.getState().refreshStorageUsage();
      expect(store.getState().storageUsage).toBeNull();
    });

    it('navigator.storageがある場合は許可状態と使用量を反映する', async () => {
      vi.stubGlobal('navigator', {
        storage: {
          persist: vi.fn(async () => true),
          persisted: vi.fn(async () => false),
          estimate: vi.fn(async () => ({ usage: 123, quota: 456 })),
        },
      });
      await store.getState().requestPersistence();
      expect(store.getState().persistenceState).toBe('granted');
      await store.getState().refreshStorageUsage();
      expect(store.getState().storageUsage).toEqual({ usage: 123, quota: 456 });
    });

    it('既に許可済みの場合はpersist()を呼ばずgrantedを返す', async () => {
      const persistMock = vi.fn(async () => true);
      vi.stubGlobal('navigator', {
        storage: {
          persist: persistMock,
          persisted: vi.fn(async () => true),
        },
      });
      await store.getState().requestPersistence();
      expect(store.getState().persistenceState).toBe('granted');
      expect(persistMock).not.toHaveBeenCalled();
    });
  });
});

afterEach(() => {
  resetDbConnectionForTests();
});
