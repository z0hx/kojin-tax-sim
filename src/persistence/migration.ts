import { ImportError } from './errors';
import { CURRENT_SCHEMA_VERSION, type AppData } from './types';

/** 03詳細設計書§5.3: バージョン番号ごとの移行関数 */
type Migration = (data: unknown) => unknown;

/**
 * v1が現行スキーマのため移行関数は無い。将来v2を切る際に `{ 2: migrateV1ToV2 }` の形で追加すると、
 * migrate()のループが古いデータを順に現行版まで引き上げる(NFR-13)。
 */
const MIGRATIONS: Record<number, Migration> = {};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonNegativeFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * YearProfileの主要な金額フィールドが非負の数値であることを検証する。
 * ネストしたすべてのフィールドを網羅する完全なスキーマ検証ではないが、
 * インポートされた不正な値(例: 負の給与額)が計算エンジンにそのまま渡ることを防ぐ(Medium#7是正)。
 */
function assertYearProfile(profile: unknown, personId: string, year: string): void {
  const where = `人物${personId}の${year}年分`;
  if (!isPlainObject(profile)) {
    throw new ImportError(`${where}のデータ形式が不正です`);
  }
  if (!isPlainObject(profile.income) || !Array.isArray(profile.income.monthly) || profile.income.monthly.length !== 12) {
    throw new ImportError(`${where}のincome.monthlyが不正です(12ヶ月分の配列である必要があります)`);
  }
  for (const rec of profile.income.monthly as unknown[]) {
    if (!isPlainObject(rec) || !isNonNegativeFiniteNumber(rec.grossSalary) || !isNonNegativeFiniteNumber(rec.socialInsurance)) {
      throw new ImportError(`${where}の月次収入データに不正な値(負の数・非数値)が含まれています`);
    }
  }
  if (!Array.isArray(profile.income.bonuses)) {
    throw new ImportError(`${where}のincome.bonusesが配列ではありません`);
  }
  for (const bonus of profile.income.bonuses as unknown[]) {
    if (!isPlainObject(bonus) || !isNonNegativeFiniteNumber(bonus.gross) || !isNonNegativeFiniteNumber(bonus.socialInsurance)) {
      throw new ImportError(`${where}の賞与データに不正な値(負の数・非数値)が含まれています`);
    }
  }
  if (!Array.isArray(profile.income.leavePeriods)) {
    throw new ImportError(`${where}のincome.leavePeriodsが配列ではありません`);
  }
  if (!isNonNegativeFiniteNumber(profile.income.otherSalaryIncome)) {
    throw new ImportError(`${where}のincome.otherSalaryIncomeが不正です`);
  }
  if (!isPlainObject(profile.deductions)) {
    throw new ImportError(`${where}のdeductionsが不正です`);
  }
  if (!isPlainObject(profile.municipality)) {
    throw new ImportError(`${where}のmunicipalityが不正です`);
  }
  if (!isPlainObject(profile.furusato) || !isNonNegativeFiniteNumber(profile.furusato.donatedAmount)) {
    throw new ImportError(`${where}のfurusato.donatedAmountが不正です`);
  }
  if (!Array.isArray(profile.furusato.donations)) {
    throw new ImportError(`${where}のfurusato.donationsが配列ではありません`);
  }
  const donationIds = new Set<string>();
  for (const d of profile.furusato.donations as unknown[]) {
    if (
      !isPlainObject(d) ||
      typeof d.id !== 'string' ||
      d.id === '' ||
      typeof d.municipalityName !== 'string' ||
      !isNonNegativeFiniteNumber(d.amount) ||
      typeof d.date !== 'string'
    ) {
      throw new ImportError(`${where}の寄附実績データに不正な値が含まれています`);
    }
    if (donationIds.has(d.id)) {
      throw new ImportError(`${where}の寄附実績データのidが重複しています`);
    }
    donationIds.add(d.id);
  }
}

/**
 * 移行後のデータが AppData として最低限の形を満たしているかを検証する。
 * 部分的に読み込んで欠損したまま計算を続けることを避けるため、不正なら例外を投げる。
 */
function assertAppData(data: unknown): asserts data is AppData {
  if (!isPlainObject(data)) {
    throw new ImportError('データの形式が不正です(オブジェクトではありません)');
  }
  if (typeof data.schemaVersion !== 'number') {
    throw new ImportError('形式が認識できません。TaxSimがエクスポートしたファイルですか?');
  }
  if (!Array.isArray(data.persons)) {
    throw new ImportError('personsが配列ではありません');
  }
  for (const p of data.persons) {
    if (!isPlainObject(p) || typeof p.id !== 'string' || typeof p.displayName !== 'string') {
      throw new ImportError('人物データの形式が不正です');
    }
    if (!isPlainObject(p.years)) {
      throw new ImportError('人物の年度データ(years)が不正です');
    }
    for (const [year, profile] of Object.entries(p.years)) {
      if (!Number.isFinite(Number(year))) {
        throw new ImportError(`人物${p.id}のyearsのキー"${year}"が数値変換できません`);
      }
      assertYearProfile(profile, p.id, year);
    }
  }
  if (data.activePersonId !== null && typeof data.activePersonId !== 'string') {
    throw new ImportError('activePersonIdが不正です');
  }
  if (!isPlainObject(data.appSettings)) {
    throw new ImportError('appSettingsが不正です');
  }
}

/**
 * schemaVersionを現行版まで順に移行する。
 * 原則: 移行できない場合は必ず例外を投げる(黙って壊れたデータを返さない)。
 */
export function migrate(data: unknown): AppData {
  if (!isPlainObject(data) || typeof data.schemaVersion !== 'number') {
    throw new ImportError('形式が認識できません。TaxSimがエクスポートしたファイルですか?');
  }
  if (data.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new ImportError('このファイルは新しいバージョンのアプリで作成されています。アプリを更新してください。');
  }

  let current: unknown = data;
  for (let v = (data.schemaVersion as number) + 1; v <= CURRENT_SCHEMA_VERSION; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new ImportError(`バージョン${v}への移行手順が見つかりません。`);
    current = m(current);
  }

  assertAppData(current);
  return current;
}
