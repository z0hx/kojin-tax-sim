import { create, type StoreApi, type UseBoundStore } from 'zustand';
import { buildCalculationResult } from '../domain/engine';
import { withDonations } from '../domain/donations';
import { ValidationError, type YearProfile } from '../domain/types';
import { loadAppData, saveAppData, clearAppData } from '../persistence/repository';
import { emptyAppData, type AppData, type Person } from '../persistence/types';
import { loadUiSettings, saveUiSettings } from '../persistence/settings';
import { exportData as exportDataFile, buildFileName, saveBlob, sanitizeFilenamePart } from '../persistence/exporter';
import { parseImportFile, buildImportPreview, applyImport } from '../persistence/importer';
import { migrate } from '../persistence/migration';
import { StorageError } from '../persistence/errors';
import { loadTaxParams } from '../taxParams/loader';
import type { TaxParams } from '../taxParams/schema';
import * as saveQueue from './saveQueue';
import { selectSpouseTotalIncome } from './selectors';
import type { AppError, AppStore, AppStoreState, StoreCalculationResult } from './types';

type Set = (partial: Partial<AppStoreState> | ((state: AppStoreState) => Partial<AppStoreState>)) => void;
type Get = () => AppStore;

export const DEFAULT_MUNICIPALITY = {
  name: '',
  prefectureName: '',
  municipalIncomeRate: 0.06,
  prefecturalIncomeRate: 0.04,
  municipalPerCapita: 3000,
  prefecturalPerCapita: 1000,
  forestTax: 1000,
  useStandardRateForFurusato: true,
};

function nowIso(): string {
  return new Date().toISOString();
}

/** テスト用に公開(UIコンポーネントテストでシングルトンstoreを初期状態に戻すために使う) */
export function initialState(): AppStoreState {
  return {
    appData: null,
    activePersonId: null,
    activeYear: null,
    taxParams: {},
    calculationResult: null,
    persistenceState: 'unknown',
    storageUsage: null,
    isLoading: false,
    isSaving: false,
    lastError: null,
    importPreview: null,
    onboardingRequired: false,
    pendingImportIncoming: null,
  };
}

function buildBlankYearProfile(year: number, defaults: Person['defaults']): YearProfile {
  return {
    year,
    municipality: { ...defaults.municipality },
    income: {
      monthly: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        status: 'estimated' as const,
        grossSalary: 0,
        socialInsurance: 0,
        isSocialInsuranceExempt: false,
      })),
      bonuses: [],
      leavePeriods: [],
      otherSalaryIncome: 0,
    },
    deductions: {
      lifeInsurance: { new: { general: 0, nursing: 0, pension: 0 }, old: { general: 0, pension: 0 }, hasChildUnder23: false },
      earthquakeInsurance: { long: 0, short: 0 },
      medical: { paid: 0, reimbursed: 0, selfMedication: 0, mode: 'auto' },
      ideco: 0,
      dependents: [],
      isSingleParent: false,
      disabilityDeductions: [],
    },
    furusato: { method: 'oneStop', donatedAmount: 0, safetyRatio: defaults.safetyRatio, donations: [] },
  };
}

/** appData.persons[personIdx]のyears[year]を差し替えた新しいAppDataを返す(イミュータブル) */
function putYearProfile(appData: AppData, personIdx: number, year: number, profile: YearProfile): AppData {
  const person = appData.persons[personIdx];
  const newPerson: Person = { ...person, updatedAt: nowIso(), years: { ...person.years, [year]: profile } };
  const persons = [...appData.persons];
  persons[personIdx] = newPerson;
  return { ...appData, persons };
}

function computeResult(
  appData: AppData,
  personId: string | null,
  year: number | null,
  taxParams: Record<number, TaxParams>
): StoreCalculationResult | null {
  if (!personId || year === null) return null;
  const person = appData.persons.find((p) => p.id === personId);
  const profile = person?.years[year];
  const params = taxParams[year];
  if (!profile || !params) return null;
  return buildCalculationResult(profile, params);
}

/** エクスポートファイル名の{人物}部分を作る。'all'ならそのまま、個別選択なら表示名をサニタイズして繋げる
 *  (レビューで発見: 個別選択の場合に生のUUIDがファイル名へそのまま出てしまっていた不具合の是正) */
function buildExportTargetLabel(persons: Person[], personIds: string[] | 'all'): string {
  if (personIds === 'all') return 'all';
  const names = personIds
    .map((id) => persons.find((p) => p.id === id)?.displayName)
    .filter((n): n is string => Boolean(n))
    .map((n) => sanitizeFilenamePart(n))
    .filter((n): n is string => n !== null);
  return names.length > 0 ? names.join('_').slice(0, 60) : 'selection';
}

/** showSaveFilePicker/ダウンロードの失敗を、ユーザーによるキャンセル(AbortError)とそれ以外で
 *  メッセージを出し分けて包む(レビューで発見: exportData/commitImportが生の例外をそのまま出していた) */
function friendlySaveBlobError(e: unknown, cancelMessage: string, failureMessage: string): StorageError {
  const name = (e as { name?: string } | undefined)?.name;
  return new StorageError(name === 'AbortError' ? cancelMessage : failureMessage, e);
}

function persistUiSelection(personId: string | null, year: number | null): void {
  const current = loadUiSettings();
  saveUiSettings({ ...current, lastActivePersonId: personId, lastActiveYear: year });
}

/**
 * 起動時の検証(migrate)に失敗した保存データを破棄し、オンボーディングからやり直す状態にする(#36)。
 * 黙って消すと利用者にはデータが消えた理由が分からないため、破棄した旨と検証エラーの内容を残す。
 */
async function discardIncompatibleData(set: Set, cause: unknown): Promise<void> {
  try {
    await clearAppData();
  } catch {
    // 破棄に失敗しても、検証を通らないデータを読み込むわけにはいかないためオンボーディングは開始する
    // (次回起動時も同じ検証で弾かれ、再びここへ来る)
  }
  persistUiSelection(null, null);
  set({
    appData: emptyAppData(),
    activePersonId: null,
    activeYear: null,
    calculationResult: null,
    onboardingRequired: true,
    isLoading: false,
    lastError: new StorageError(
      `保存されていたデータが現行の形式に適合しないため破棄しました(${cause instanceof Error ? cause.message : String(cause)})。お手数ですが最初から入力してください。`,
      cause
    ),
  });
}

/** taxParams[year]が無ければloadTaxParamsで取得しキャッシュする。失敗時はlastErrorにセットしnullを返す(fail closed) */
async function ensureTaxParamsLoaded(year: number, set: Set, get: Get): Promise<TaxParams | null> {
  const cached = get().taxParams[year];
  if (cached) return cached;
  try {
    const params = await loadTaxParams(year, import.meta.env.BASE_URL);
    set((s) => ({ taxParams: { ...s.taxParams, [year]: params } }));
    return params;
  } catch (e) {
    set({ lastError: e as AppError });
    return null;
  }
}

/** 現在アクティブな人物・年度のYearProfileをイミュータブルに更新し、再計算+デバウン保存する共通処理 */
function updateActiveYearProfile(set: Set, get: Get, mutate: (profile: YearProfile) => YearProfile): void {
  const state = get();
  if (!state.appData || !state.activePersonId || state.activeYear === null) return;
  const personIdx = state.appData.persons.findIndex((p) => p.id === state.activePersonId);
  if (personIdx === -1) return;
  const profile = state.appData.persons[personIdx].years[state.activeYear];
  if (!profile) return;

  const newProfile = mutate(profile);
  const newAppData = putYearProfile(state.appData, personIdx, state.activeYear, newProfile);
  const newResult = computeResult(newAppData, state.activePersonId, state.activeYear, state.taxParams);
  set({ appData: newAppData, calculationResult: newResult });
  saveQueue.schedule(newAppData);
}

/** 人物追加・削除・年度作成など、非同期でtaxParams取得後にcalculationResultを確定させる共通処理。
 *  awaitの間にユーザーが別の人物/年度へ切り替えていた場合は結果を捨てる(古い計算結果で上書きしない)。 */
async function finalizeAfterYearSwitch(
  set: Set,
  get: Get,
  expectedPersonId: string | null,
  expectedYear: number
): Promise<void> {
  const params = await ensureTaxParamsLoaded(expectedYear, set, get);
  const latest = get();
  if (latest.activePersonId !== expectedPersonId || latest.activeYear !== expectedYear || !latest.appData) return;
  const result = params ? computeResult(latest.appData, expectedPersonId, expectedYear, latest.taxParams) : null;
  set({ calculationResult: result });
}

function createStoreImpl(set: Set, get: Get): AppStore {
  return {
    ...initialState(),

    async loadInitialData() {
      set({ isLoading: true });
      let stored: AppData | null;
      try {
        stored = await loadAppData();
      } catch (e) {
        set({ isLoading: false, lastError: e as AppError, appData: emptyAppData(), onboardingRequired: true });
        return;
      }

      // 保存済みデータもインポートと同じmigrate()を通す。検証しないまま流すと、旧形式(例: FR-21以前の
      // furusato.donationsを持たないデータ)が計算・UIへ届いてTypeErrorで落ちるため(#36)
      let loaded: AppData | null = null;
      if (stored) {
        try {
          loaded = migrate(stored);
        } catch (e) {
          await discardIncompatibleData(set, e);
          return;
        }
      }

      if (!loaded) {
        set({
          appData: emptyAppData(),
          onboardingRequired: true,
          activePersonId: null,
          activeYear: null,
          calculationResult: null,
          isLoading: false,
        });
        return;
      }

      const ui = loadUiSettings();
      // localStorage(ui.lastActivePersonId)はperson切替のたびに同期的に書かれるため、500msデバウンス
      // 保存のappData.activePersonIdより新しい可能性が高い(タブを閉じるタイミング次第でappData側は
      // 反映前のままになりうる)。よってlocalStorageを優先し、appData側はフォールバックとする
      const activePersonId =
        (ui.lastActivePersonId && loaded.persons.some((p) => p.id === ui.lastActivePersonId) ? ui.lastActivePersonId : null) ??
        (loaded.activePersonId && loaded.persons.some((p) => p.id === loaded!.activePersonId) ? loaded.activePersonId : null) ??
        (loaded.persons[0]?.id ?? null);
      const activePerson = activePersonId ? loaded.persons.find((p) => p.id === activePersonId) : undefined;
      const years = activePerson ? Object.keys(activePerson.years).map(Number) : [];
      const preferredYear = ui.lastActiveYear !== null && activePerson?.years[ui.lastActiveYear] ? ui.lastActiveYear : null;
      const activeYear = preferredYear ?? (years.length > 0 ? Math.max(...years) : null);

      set({ appData: loaded, activePersonId, activeYear, onboardingRequired: loaded.persons.length === 0 });

      // 全人物・全年度のtaxParamsを先読みする(household summary用)。activeYear以外の失敗はアプリ全体を止めない。
      const allYears = new Set<number>();
      for (const p of loaded.persons) {
        for (const y of Object.keys(p.years)) allYears.add(Number(y));
      }
      await Promise.allSettled(Array.from(allYears).map((y) => ensureTaxParamsLoaded(y, set, get)));

      if (activeYear !== null && activePersonId) {
        const latest = get();
        const params = latest.taxParams[activeYear];
        const result = params ? computeResult(latest.appData!, activePersonId, activeYear, latest.taxParams) : null;
        set({ calculationResult: result });
      }
      set({ isLoading: false });
    },

    async setActivePerson(personId) {
      try {
        await saveQueue.flushNow();
      } catch (e) {
        set({ lastError: e as AppError });
        return;
      }
      const state = get();
      if (!state.appData) return;
      const person = state.appData.persons.find((p) => p.id === personId);
      if (!person) return;
      const years = Object.keys(person.years).map(Number);
      const year = years.length > 0 ? Math.max(...years) : null;
      // appData.activePersonIdもここで更新しておく(レビューで発見: 更新しないとputYearProfile経由で
      // 古い値が永続化され続け、次回起動時にlocalStorageの選択と食い違う)
      const newAppData = { ...state.appData, activePersonId: personId };
      set({ appData: newAppData, activePersonId: personId, activeYear: year, calculationResult: null });
      saveQueue.schedule(newAppData);
      persistUiSelection(personId, year);
      if (year !== null) {
        await finalizeAfterYearSwitch(set, get, personId, year);
      }
    },

    async setActiveYear(year) {
      try {
        await saveQueue.flushNow();
      } catch (e) {
        set({ lastError: e as AppError });
        return;
      }
      const state = get();
      set({ activeYear: year, calculationResult: null });
      persistUiSelection(state.activePersonId, year);
      const person = state.activePersonId ? state.appData?.persons.find((p) => p.id === state.activePersonId) : undefined;
      if (!person?.years[year]) return; // プロファイル未作成の年度への切替は計算しない(クラッシュ防止)
      await finalizeAfterYearSwitch(set, get, state.activePersonId, year);
    },

    // 注意: 既存のyears[year]があれば無条件で上書きする。現状の呼び出し元(IncomeScreenの初年度作成導線)は
    // activeYearがnull(=対象人物にまだ年度データが1件も無い)ときにしか呼ばないため上書きは起こらないが、
    // 将来ダッシュボード等で年度切替/追加UIからも呼ぶ場合は、既存年度への誤上書きを防ぐガード
    // (確認ダイアログ等)を呼び出し側に追加すること。
    async createBlankYear(year) {
      const state = get();
      if (!state.appData || !state.activePersonId) return;
      const personIdx = state.appData.persons.findIndex((p) => p.id === state.activePersonId);
      if (personIdx === -1) return;
      const person = state.appData.persons[personIdx];
      const blank = buildBlankYearProfile(year, person.defaults);
      const newAppData = putYearProfile(state.appData, personIdx, year, blank);
      set({ appData: newAppData, activeYear: year, calculationResult: null });
      saveQueue.schedule(newAppData);
      persistUiSelection(state.activePersonId, year);
      await finalizeAfterYearSwitch(set, get, state.activePersonId, year);
    },

    async copyYearFromPrevious(year) {
      const state = get();
      if (!state.appData || !state.activePersonId) return;
      const personIdx = state.appData.persons.findIndex((p) => p.id === state.activePersonId);
      if (personIdx === -1) return;
      const person = state.appData.persons[personIdx];
      const prev = person.years[year - 1];
      if (!prev) {
        await get().createBlankYear(year);
        return;
      }
      const cloned = structuredClone(prev);
      cloned.year = year;
      // 寄附実績は年度ごとの記録のため、前年分を引き継がず新年度は空にする(FR-21)
      cloned.furusato = withDonations(cloned.furusato, []);
      const newAppData = putYearProfile(state.appData, personIdx, year, cloned);
      set({ appData: newAppData, activeYear: year, calculationResult: null });
      saveQueue.schedule(newAppData);
      persistUiSelection(state.activePersonId, year);
      await finalizeAfterYearSwitch(set, get, state.activePersonId, year);
    },

    updateIncome(patch) {
      updateActiveYearProfile(set, get, (profile) => ({ ...profile, income: { ...profile.income, ...patch } }));
    },
    updateDeductions(patch) {
      updateActiveYearProfile(set, get, (profile) => ({ ...profile, deductions: { ...profile.deductions, ...patch } }));
    },
    updateHousingLoan(input) {
      updateActiveYearProfile(set, get, (profile) => ({ ...profile, housingLoan: input ?? undefined }));
    },
    updateActuals(actuals) {
      updateActiveYearProfile(set, get, (profile) => ({ ...profile, actuals: actuals ?? undefined }));
    },
    linkSpouseIncome(spouseId) {
      const state = get();
      if (state.activeYear === null || spouseId === state.activePersonId) return;
      const income = selectSpouseTotalIncome({ appData: state.appData, taxParams: state.taxParams }, spouseId, state.activeYear);
      if (income === null) {
        set({
          lastError: new ValidationError([
            { field: 'spouseId', rule: 'yearDataRequired', message: `対象の人物に${state.activeYear}年分のデータが無いため連携できません。先に対象の人物の収入を入力してください。` },
          ]),
        });
        return;
      }
      updateActiveYearProfile(set, get, (profile) => ({
        ...profile,
        deductions: { ...profile.deductions, spouse: { ...profile.deductions.spouse, totalIncome: income } },
      }));
      set({ lastError: null });
    },
    updateFurusatoInput(patch) {
      updateActiveYearProfile(set, get, (profile) => ({ ...profile, furusato: { ...profile.furusato, ...patch } }));
    },
    recordDonation(entry) {
      updateActiveYearProfile(set, get, (profile) => {
        const donations = [...profile.furusato.donations, { ...entry, id: crypto.randomUUID() }];
        return { ...profile, furusato: withDonations(profile.furusato, donations) };
      });
    },
    removeDonation(id) {
      updateActiveYearProfile(set, get, (profile) => {
        const donations = profile.furusato.donations.filter((d) => d.id !== id);
        return { ...profile, furusato: withDonations(profile.furusato, donations) };
      });
    },
    updateMunicipality(patch) {
      updateActiveYearProfile(set, get, (profile) => ({ ...profile, municipality: { ...profile.municipality, ...patch } }));
    },

    addPerson(displayName, color, municipality) {
      const state = get();
      const base = state.appData ?? emptyAppData();
      const now = nowIso();
      const newPerson: Person = {
        id: crypto.randomUUID(),
        displayName,
        color,
        createdAt: now,
        updatedAt: now,
        years: {},
        defaults: { municipality: { ...(municipality ?? DEFAULT_MUNICIPALITY) }, safetyRatio: 0.9 },
      };
      const newAppData: AppData = { ...base, persons: [...base.persons, newPerson], activePersonId: newPerson.id };
      set({
        appData: newAppData,
        activePersonId: newPerson.id,
        activeYear: null,
        calculationResult: null,
        onboardingRequired: false,
      });
      saveQueue.schedule(newAppData);
      persistUiSelection(newPerson.id, null);
      return newPerson.id;
    },

    async completeOnboarding(displayName, color, municipality) {
      const personId = get().addPerson(displayName, color, municipality);
      // addPerson後にget()し直す(先に取得したstateを使うとappData.persons追加前のappDataで
      // appSettingsだけ上書きしてしまい、直前に作った人物を消してしまう)
      const afterAdd = get();
      if (afterAdd.appData) {
        const newAppData: AppData = { ...afterAdd.appData, appSettings: { ...afterAdd.appData.appSettings, onboardingCompleted: true } };
        set({ appData: newAppData });
        saveQueue.schedule(newAppData);
      }
      // オンボーディング完了は初めての書き込みであり、直後にタブを閉じられるとデバウンス待ちの間に
      // 「保存されているはず」の説明(S-12ステップ1)に反して消える恐れがあるため即時確定させる
      try {
        await saveQueue.flushNow();
      } catch (e) {
        set({ lastError: e as AppError });
      }
      return personId;
    },

    duplicatePerson(personId) {
      const state = get();
      if (!state.appData) return personId;
      const source = state.appData.persons.find((p) => p.id === personId);
      if (!source) return personId;
      const now = nowIso();
      const clone: Person = { ...structuredClone(source), id: crypto.randomUUID(), createdAt: now, updatedAt: now };
      // activePersonIdは変更しない(複製操作中にヘッダーのPersonSelector表示が画面遷移なしに切り替わらないようにする)
      const newAppData: AppData = { ...state.appData, persons: [...state.appData.persons, clone] };
      set({ appData: newAppData });
      saveQueue.schedule(newAppData);
      return clone.id;
    },

    renamePerson(personId, displayName) {
      const state = get();
      if (!state.appData) return;
      const idx = state.appData.persons.findIndex((p) => p.id === personId);
      if (idx === -1) return;
      const persons = [...state.appData.persons];
      persons[idx] = { ...persons[idx], displayName, updatedAt: nowIso() };
      const newAppData = { ...state.appData, persons };
      set({ appData: newAppData });
      saveQueue.schedule(newAppData);
    },

    setPersonColor(personId, color) {
      const state = get();
      if (!state.appData) return;
      const idx = state.appData.persons.findIndex((p) => p.id === personId);
      if (idx === -1) return;
      const persons = [...state.appData.persons];
      persons[idx] = { ...persons[idx], color, updatedAt: nowIso() };
      const newAppData = { ...state.appData, persons };
      set({ appData: newAppData });
      saveQueue.schedule(newAppData);
    },

    deletePerson(personId) {
      const state = get();
      if (!state.appData) return;
      const wasActive = state.activePersonId === personId;
      const persons = state.appData.persons.filter((p) => p.id !== personId);
      const newActivePersonId = wasActive ? (persons[0]?.id ?? null) : state.appData.activePersonId;
      const newAppData: AppData = { ...state.appData, persons, activePersonId: newActivePersonId };
      // 残り0人になった場合はonboardingRequiredを立てる(そうしないと画面状態がonboardingRequired=falseのまま
      // 人物ゼロ件という未定義の状態になる。レビューで発見)
      const onboardingRequired = persons.length === 0;

      if (!wasActive) {
        set({ appData: newAppData, onboardingRequired });
        saveQueue.schedule(newAppData);
        return;
      }

      const fallbackPerson = persons[0];
      const years = fallbackPerson ? Object.keys(fallbackPerson.years).map(Number) : [];
      const newActiveYear = years.length > 0 ? Math.max(...years) : null;
      const newResult = computeResult(newAppData, newActivePersonId, newActiveYear, state.taxParams);
      set({
        appData: newAppData,
        activePersonId: newActivePersonId,
        activeYear: newActiveYear,
        calculationResult: newResult,
        onboardingRequired,
      });
      saveQueue.schedule(newAppData);
      persistUiSelection(newActivePersonId, newActiveYear);
    },

    async deletePersonWithBackup(personId) {
      const state = get();
      if (!state.appData) return;
      const person = state.appData.persons.find((p) => p.id === personId);
      if (!person) return;

      try {
        const blob = await exportDataFile(state.appData, { personIds: [personId], includeSettings: false });
        const target = sanitizeFilenamePart(person.displayName) ?? person.id.slice(0, 8);
        await saveBlob(blob, buildFileName(`backup-${target}`, false));
      } catch (e) {
        set({
          lastError: friendlySaveBlobError(
            e,
            'バックアップの保存がキャンセルされたため、人物を削除しませんでした。もう一度お試しください。',
            'バックアップのエクスポートに失敗したため、人物を削除しませんでした。'
          ),
        });
        return;
      }

      // バックアップ待ち(ファイル保存ダイアログ等)の間に他の操作でappDataが変わっている可能性があるため、
      // ここで最新状態を取り直す(レビューで発見: 古いstateのまま削除すると割り込んだ変更を上書きしてしまう)
      const latest = get();
      if (!latest.appData || !latest.appData.persons.some((p) => p.id === personId)) return;
      const wasActive = latest.activePersonId === personId;
      const persons = latest.appData.persons.filter((p) => p.id !== personId);
      const newActivePersonId = wasActive ? (persons[0]?.id ?? null) : latest.appData.activePersonId;
      const newAppData: AppData = { ...latest.appData, persons, activePersonId: newActivePersonId };
      const onboardingRequired = persons.length === 0;

      try {
        // 削除は不可逆操作のため、deleteAllData/commitImportと同様にデバウンスに任せず同期的に確定させる
        await saveQueue.withLock(async () => {
          saveQueue.cancelPendingTimer();
          await saveQueue.run(() => saveAppData(newAppData));
          saveQueue.recordSaved(newAppData);
        });
      } catch (e) {
        set({ lastError: e as AppError });
        return;
      }

      if (!wasActive) {
        set({ appData: newAppData, onboardingRequired, lastError: null });
        return;
      }

      const fallbackPerson = persons[0];
      const years = fallbackPerson ? Object.keys(fallbackPerson.years).map(Number) : [];
      const newActiveYear = years.length > 0 ? Math.max(...years) : null;
      const newResult = computeResult(newAppData, newActivePersonId, newActiveYear, latest.taxParams);
      set({
        appData: newAppData,
        activePersonId: newActivePersonId,
        activeYear: newActiveYear,
        calculationResult: newResult,
        onboardingRequired,
        lastError: null,
      });
      persistUiSelection(newActivePersonId, newActiveYear);
    },

    setSafetyRatio(ratio) {
      updateActiveYearProfile(set, get, (profile) => ({ ...profile, furusato: { ...profile.furusato, safetyRatio: ratio } }));
    },

    setCapMode(mode) {
      const state = get();
      if (!state.appData) return;
      const newAppData = { ...state.appData, appSettings: { ...state.appData.appSettings, furusatoCapMode: mode } };
      set({ appData: newAppData });
      saveQueue.schedule(newAppData);
    },

    async exportData(opts) {
      const state = get();
      if (!state.appData) return;
      // 呼び出し側(UI)が保持しているpersonIdsは、置換インポート等でpersonsが入れ替わった後も
      // 古いidを含んだままになりうる。実在するidだけに絞り込んでから空かどうかを判定する
      // (レビューで発見: UI側のstale idチェック漏れにより0件の「成功したエクスポート」が
      //  作られてしまう不具合があったため、store側でも防御する)
      const resolvedPersonIds: string[] | 'all' =
        opts.personIds === 'all' ? 'all' : opts.personIds.filter((id) => state.appData!.persons.some((p) => p.id === id));
      if (resolvedPersonIds !== 'all' && resolvedPersonIds.length === 0) {
        set({
          lastError: new ValidationError([
            { field: 'personIds', rule: 'nonEmpty', message: 'エクスポート対象の人物を1人以上選択してください' },
          ]),
        });
        return;
      }
      try {
        const blob = await exportDataFile(state.appData, { ...opts, personIds: resolvedPersonIds });
        const target = buildExportTargetLabel(state.appData.persons, resolvedPersonIds);
        const filename = buildFileName(target, Boolean(opts.passphrase));
        await saveBlob(blob, filename);
        const newAppData = { ...state.appData, appSettings: { ...state.appData.appSettings, lastExportedAt: nowIso() } };
        set({ appData: newAppData, lastError: null });
        saveQueue.schedule(newAppData);
      } catch (e) {
        set({ lastError: friendlySaveBlobError(e, 'エクスポートの保存がキャンセルされました。', 'エクスポートに失敗しました。') });
      }
    },

    async previewImport(file, mode, passphrase) {
      const state = get();
      try {
        const parsed = await parseImportFile(file, passphrase);
        const current = state.appData ?? emptyAppData();
        const preview = buildImportPreview(current, parsed, mode, file.name);
        set({ importPreview: preview, pendingImportIncoming: parsed.data, lastError: null });
      } catch (e) {
        set({ importPreview: null, pendingImportIncoming: null, lastError: e as AppError });
      }
    },

    async commitImport(mode) {
      const state = get();
      if (!state.pendingImportIncoming) return;
      const current = state.appData ?? emptyAppData();
      const incoming = state.pendingImportIncoming;

      if (mode === 'replace') {
        try {
          const backupBlob = await exportDataFile(current, { personIds: 'all', includeSettings: true });
          await saveBlob(backupBlob, buildFileName('backup-before-replace', false));
        } catch (e) {
          set({
            lastError: friendlySaveBlobError(
              e,
              '置換前のバックアップ保存がキャンセルされたため、インポートを中止しました。',
              '置換前のバックアップに失敗したため、インポートを中止しました。'
            ),
          });
          return;
        }
      }

      let newAppData: AppData;
      try {
        newAppData = applyImport(current, incoming, mode);
        // recordSavedはロックが解除される前(withLockのコールバック内)で確定させる。
        // ロック解除後までrecordSavedを遅らせると、その間にflushNow()等が古いlastScheduledDataを
        // 見てしまう窓ができるため(レビューで発見された残存High不具合の是正)。
        await saveQueue.withLock(async () => {
          saveQueue.cancelPendingTimer();
          await saveQueue.run(() => saveAppData(newAppData));
          saveQueue.recordSaved(newAppData);
        });
      } catch (e) {
        set({ lastError: e as AppError });
        return;
      }

      const activePersonId = newAppData.activePersonId;
      const person = activePersonId ? newAppData.persons.find((p) => p.id === activePersonId) : undefined;
      const years = person ? Object.keys(person.years).map(Number) : [];
      const activeYear = years.length > 0 ? Math.max(...years) : null;

      set({
        appData: newAppData,
        activePersonId,
        activeYear,
        calculationResult: null,
        importPreview: null,
        pendingImportIncoming: null,
        onboardingRequired: newAppData.persons.length === 0,
      });
      persistUiSelection(activePersonId, activeYear);

      if (activeYear !== null) {
        await finalizeAfterYearSwitch(set, get, activePersonId, activeYear);
      }
    },

    cancelImportPreview() {
      set({ importPreview: null, pendingImportIncoming: null, lastError: null });
    },

    clearLastError() {
      set({ lastError: null });
    },

    async requestPersistence() {
      const nav = globalThis.navigator as (Navigator & { storage?: StorageManager }) | undefined;
      if (!nav?.storage?.persist) {
        set({ persistenceState: 'unsupported' });
        return;
      }
      const already = await nav.storage.persisted?.();
      if (already) {
        set({ persistenceState: 'granted' });
        return;
      }
      const granted = await nav.storage.persist();
      set({ persistenceState: granted ? 'granted' : 'denied' });
    },

    async refreshStorageUsage() {
      const nav = globalThis.navigator as (Navigator & { storage?: StorageManager }) | undefined;
      if (!nav?.storage?.estimate) {
        set({ storageUsage: null });
        return;
      }
      const { usage = 0, quota = 0 } = await nav.storage.estimate();
      set({ storageUsage: { usage, quota } });
    },

    async deleteAllData() {
      try {
        await saveQueue.withLock(async () => {
          saveQueue.cancelPendingTimer();
          await saveQueue.run(() => clearAppData());
          // ロック解除前にrecordSavedを確定させる(commitImportと同じ理由。上のコメント参照)
          saveQueue.recordSaved(emptyAppData());
        });
      } catch (e) {
        set({ lastError: e as AppError });
        return;
      }
      set({
        appData: emptyAppData(),
        activePersonId: null,
        activeYear: null,
        calculationResult: null,
        onboardingRequired: true,
        importPreview: null,
        pendingImportIncoming: null,
        lastError: null,
      });
      persistUiSelection(null, null);
    },
  };
}

/** テスト用に独立したストアインスタンスを生成するファクトリ。本体のuseAppStoreもこれで生成する */
export function createAppStore(): UseBoundStore<StoreApi<AppStore>> {
  const store = create<AppStore>()((set, get) => createStoreImpl(set, get));
  saveQueue.setSavingListener((saving) => store.setState({ isSaving: saving }));
  return store;
}

export const useAppStore = createAppStore();
