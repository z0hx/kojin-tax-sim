import type { TaxParams } from './schema';
import { describeTaxParamsUnavailable } from './defaults';

export class TaxParamsError extends Error {
  year: number;
  constructor(year: number, message: string) {
    super(message);
    this.name = 'TaxParamsError';
    this.year = year;
  }
}

const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * 年分の税制パラメータを取得する。03詳細設計書§8: 取得失敗時は例外を投げ、
 * 古い/欠損データで計算を続行しない(fail closed、defaults.ts参照)。
 */
export async function loadTaxParams(year: number, baseUrl = '/'): Promise<TaxParams> {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}taxParams/${year}.json`);
  } catch (e) {
    throw new TaxParamsError(year, describeTaxParamsUnavailable(year, (e as Error).message));
  }
  if (!res.ok) {
    throw new TaxParamsError(year, `税制パラメータの取得に失敗しました(${year}年分): HTTP ${res.status}`);
  }
  let data: TaxParams;
  try {
    data = (await res.json()) as TaxParams;
  } catch (e) {
    throw new TaxParamsError(year, `税制パラメータの形式が不正です(${year}年分): ${(e as Error).message}`);
  }
  if (data.year !== year) {
    throw new TaxParamsError(year, `税制パラメータの年分が一致しません(期待:${year}, 実際:${data.year})`);
  }
  return data;
}

/** R-01対応: verifiedAtから1年以上経過している場合に警告するための判定 */
export function isTaxParamsStale(params: TaxParams, now: Date = new Date()): boolean {
  const verified = new Date(params.meta.verifiedAt).getTime();
  return now.getTime() - verified > ONE_YEAR_MS;
}
