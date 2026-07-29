import type { ValidationError, CalculationResult } from '../domain/types';
import type { ImportError, CryptoError, StorageError } from '../persistence/errors';
import type { AppData, Person } from '../persistence/types';
import type { ImportMode, ImportPreview } from '../persistence/importer';
import type { ExportOptions } from '../persistence/exporter';
import type { TaxParams } from '../taxParams/schema';
import type { TaxParamsError } from '../taxParams/loader';
import type {
  ActualValues,
  DeductionInput,
  DonationRecord,
  FurusatoInput,
  HousingLoanInput,
  IncomeInput,
  MunicipalityConfig,
} from '../domain/types';

/** 03詳細設計書§8.1のAppError合併型 */
export type AppError = ImportError | CryptoError | ValidationError | StorageError | TaxParamsError;

/** engine.buildCalculationResultの実際の戻り値の形。03詳細設計書§4.1は2つの完全なCalculationResultを
 *  想定しているが、engine.tsはstandard/conservativeでfurusatoの上限額系フィールドのみが異なる
 *  単一オブジェクトを返すため、ここではその実際の型に合わせる。
 *
 *  注意: `furusatoConservative`のうち実際にconservativeモードの値なのは`limitAmount`/`recommendedAmount`のみ。
 *  `specialCapReached`/`breakdown`はstandardモードの値のコピーであり、conservativeモードでの実際の値ではない
 *  (engine.ts の buildCalculationResult 実装がそうなっているため)。両モードの内訳まで比較する画面を作る場合は、
 *  engine側で conservative の完全なスナップショットを返すところから直す必要がある。
 *
 *  `confidenceRatio`は収入見込みの確定率(実績月数/12, FR-03/W-06と同じ値)。収入入力画面向けに公開している。
 */
export type StoreCalculationResult = CalculationResult & { furusatoConservative: CalculationResult['furusato']; confidenceRatio: number };

export interface AppStoreState {
  /** nullは「まだloadInitialDataが完了していない」ことを表す。完了後は常に有効なAppData(空でもemptyAppData())になる */
  appData: AppData | null;
  activePersonId: string | null;
  activeYear: number | null;
  taxParams: Record<number, TaxParams>;
  calculationResult: StoreCalculationResult | null;
  persistenceState: 'unsupported' | 'granted' | 'denied' | 'unknown';
  storageUsage: { usage: number; quota: number } | null;
  isLoading: boolean;
  isSaving: boolean;
  lastError: AppError | null;
  importPreview: ImportPreview | null;
  /** 初回起動でpersons が0件の場合にtrue。S-12オンボーディング表示の分岐に使う */
  onboardingRequired: boolean;
  /** previewImportで解析済みの取込データ。commitImport実行時にのみ参照する内部状態(UIには表示しない) */
  pendingImportIncoming: AppData | null;
}

export interface AppStoreActions {
  loadInitialData(): Promise<void>;
  setActivePerson(personId: string): Promise<void>;
  setActiveYear(year: number): Promise<void>;
  /** 空のYearProfileを新規作成する。新規人物の初年度や、前年データが無い年度の作成に使う。
   *  対象年のデータが既にある場合は上書きせずlastErrorをセットする(Issue #49) */
  createBlankYear(year: number): Promise<void>;
  /** 前年のYearProfileをコピーして作成する。前年データが無ければcreateBlankYearにフォールバックする
   *  (過去年分の作成では前年が無いことが通常であり、その場合は人物の既定値からの空データになる)。
   *  対象年のデータが既にある場合は上書きせずlastErrorをセットする(Issue #49) */
  copyYearFromPrevious(year: number): Promise<void>;
  updateIncome(patch: Partial<IncomeInput>): void;
  updateDeductions(patch: Partial<DeductionInput>): void;
  /** HousingLoanInputはYearProfile上optionalなオブジェクトであり、Partialマージは安全でないため
   *  完全なオブジェクトまたはnull(住宅ローン控除の入力を取り消す)を受け取る */
  updateHousingLoan(input: HousingLoanInput | null): void;
  /** ActualValues(検算モード、FR-17)もHousingLoanInputと同様YearProfile上optionalなため、
   *  完全なオブジェクトまたはnull(実績値の入力を取り消す)を受け取る */
  updateActuals(actuals: ActualValues | null): void;
  /** 世帯ビュー(S-11、FR-29)。指定した人物(spouseId)の合計所得金額を、現在アクティブな人物の
   *  アクティブ年度のdeductions.spouse.totalIncomeへコピーする。activeYearが無い場合、または
   *  spouseIdがアクティブな人物自身を指す場合は何もしない。対象年のYearProfileまたはtaxParamsが
   *  無く所得が算出できない場合はlastErrorをセットする(何もコピーしない)。 */
  linkSpouseIncome(spouseId: string): void;
  updateFurusatoInput(patch: Partial<FurusatoInput>): void;
  /** FR-21。寄附実績(自治体・金額・日付)を追記し、furusato.donatedAmountを合計額へ更新する */
  recordDonation(entry: Omit<DonationRecord, 'id'>): void;
  /** FR-21。指定idの寄附実績を削除し、furusato.donatedAmountを合計額へ更新する */
  removeDonation(id: string): void;
  updateMunicipality(patch: Partial<MunicipalityConfig>): void;
  /** FR-09/FR-13。人物の既定値(新しい年度を作成したときの初期値)を更新する。
   *  既存年度のYearProfileには影響しない(年度ごとの設定はupdateMunicipality/setSafetyRatioで別に変更する) */
  updatePersonDefaults(personId: string, patch: Partial<Person['defaults']>): void;
  /** 新規人物を追加し、その人物に切り替える。municipalityを省略した場合は標準税率(既定値)を使う。戻り値は新規人物のid */
  addPerson(displayName: string, color: string, municipality?: MunicipalityConfig): string;
  renamePerson(personId: string, displayName: string): void;
  setPersonColor(personId: string, color: string): void;
  /** 人物を複製する(新しいidで年度データを含めて複製)。activePersonIdは変更しない。戻り値は複製先のid */
  duplicatePerson(personId: string): string;
  deletePerson(personId: string): void;
  /** S-12オンボーディング完了処理。人物を作成(自治体の既定値込み)し、即時保存する
   *  (初回の書き込みのためデバウンスに任せない)。戻り値は新規人物のid */
  completeOnboarding(displayName: string, color: string, municipality: MunicipalityConfig): Promise<string>;
  /** 削除前にその人物単体のデータを非暗号化でエクスポート・ダウンロードさせ、成功した場合のみ削除する。
   *  エクスポートが失敗・キャンセルされた場合は削除せずlastErrorをセットして終了する(S-10要件)。 */
  deletePersonWithBackup(personId: string): Promise<void>;
  setSafetyRatio(ratio: number): void;
  exportData(opts: ExportOptions): Promise<void>;
  previewImport(file: File, mode: ImportMode, passphrase?: string): Promise<void>;
  commitImport(mode: ImportMode): Promise<void>;
  /** previewImportで作った差分プレビューを破棄する(ファイル選択のやり直し・キャンセル用)。副作用は無い */
  cancelImportPreview(): void;
  /** UIのエラーバナーを閉じるためlastErrorをnullに戻す。副作用は無い */
  clearLastError(): void;
  requestPersistence(): Promise<void>;
  refreshStorageUsage(): Promise<void>;
  deleteAllData(): Promise<void>;
}

export type AppStore = AppStoreState & AppStoreActions;
