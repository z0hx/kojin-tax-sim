import type { ValidationError, CalculationResult } from '../domain/types';
import type { ImportError, CryptoError, StorageError } from '../persistence/errors';
import type { AppData } from '../persistence/types';
import type { ImportMode, ImportPreview } from '../persistence/importer';
import type { ExportOptions } from '../persistence/exporter';
import type { TaxParams } from '../taxParams/schema';
import type { TaxParamsError } from '../taxParams/loader';
import type {
  DeductionInput,
  FurusatoCapMode,
  FurusatoInput,
  HousingLoanInput,
  IncomeInput,
  MunicipalityConfig,
} from '../domain/types';

/** 03詳細設計書§8.1のAppError合併型 */
export type AppError = ImportError | CryptoError | ValidationError | StorageError | TaxParamsError;

/** engine.buildCalculationResultの実際の戻り値の形。03詳細設計書§4.1は2つの完全なCalculationResultを
 *  想定しているが、実装済みのengine.tsはstandard/conservativeでfurusatoの上限額系フィールドのみが異なる
 *  単一オブジェクトを返す(engine.ts参照)。engine.ts自体は本Issueの範囲外のため、ここではその実際の型に合わせる。
 *
 *  注意: `furusatoConservative`のうち実際にconservativeモードの値なのは`limitAmount`/`recommendedAmount`のみ。
 *  `specialCapReached`/`breakdown`はstandardモードの値のコピーであり、conservativeモードでの実際の値ではない
 *  (engine.ts の buildCalculationResult 実装がそうなっているため)。S-05 CapModeComparisonToggle 実装時は注意。
 */
export type StoreCalculationResult = CalculationResult & { furusatoConservative: CalculationResult['furusato'] };

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
  /** 空のYearProfileを新規作成する。新規人物の初年度や、前年データが無い年度の作成に使う */
  createBlankYear(year: number): Promise<void>;
  /** 前年のYearProfileをコピーして作成する。前年データが無ければcreateBlankYearにフォールバックする */
  copyYearFromPrevious(year: number): Promise<void>;
  updateIncome(patch: Partial<IncomeInput>): void;
  updateDeductions(patch: Partial<DeductionInput>): void;
  /** HousingLoanInputはYearProfile上optionalなオブジェクトであり、Partialマージは安全でないため
   *  完全なオブジェクトまたはnull(住宅ローン控除の入力を取り消す)を受け取る */
  updateHousingLoan(input: HousingLoanInput | null): void;
  updateFurusatoInput(patch: Partial<FurusatoInput>): void;
  updateMunicipality(patch: Partial<MunicipalityConfig>): void;
  /** 新規人物を追加し、その人物に切り替える。戻り値は新規人物のid */
  addPerson(displayName: string, color: string): string;
  renamePerson(personId: string, displayName: string): void;
  setPersonColor(personId: string, color: string): void;
  deletePerson(personId: string): void;
  setSafetyRatio(ratio: number): void;
  setCapMode(mode: FurusatoCapMode): void;
  exportData(opts: ExportOptions): Promise<void>;
  previewImport(file: File, mode: ImportMode, passphrase?: string): Promise<void>;
  commitImport(mode: ImportMode): Promise<void>;
  requestPersistence(): Promise<void>;
  refreshStorageUsage(): Promise<void>;
  deleteAllData(): Promise<void>;
}

export type AppStore = AppStoreState & AppStoreActions;
