/**
 * public/taxParams/ に置かれた実データを、アプリと同じ経路(loadTaxParams)で検証する。
 * 新しい年分を追加したときに、スキーマ違反や meta の書き忘れを `npm run test` で捕まえるためのもの
 * (README「税制パラメータの追加・更新」の手順3が拠り所とするテスト)。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTaxParams } from '../loader';
import { SUPPORTED_TAX_YEARS } from '../supportedYears';

const PARAMS_DIR = join(process.cwd(), 'public', 'taxParams');

/** 年分ファイルのみを対象にする(将来付随ファイルが増えても壊れないようにする) */
const yearFiles = readdirSync(PARAMS_DIR)
  .filter((name) => /^\d{4}\.json$/.test(name))
  .sort();

function stubFetchFor(fileName: string): void {
  const body = readFileSync(join(PARAMS_DIR, fileName), 'utf-8');
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status: 200 }))
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public/taxParams の実データ', () => {
  it('年分ファイルが1件以上存在する', () => {
    expect(yearFiles.length).toBeGreaterThan(0);
  });

  // Issue #49: 年度データを作成できる年分はSUPPORTED_TAX_YEARSで決まる。ファイルを追加したのに
  // 一覧を更新し忘れると、その年分をアプリから作成できないまま気づかない
  it('SUPPORTED_TAX_YEARSが年分ファイルの実体と一致する', () => {
    const yearsFromFiles = yearFiles.map((name) => Number(name.replace('.json', ''))).sort((a, b) => a - b);
    expect([...SUPPORTED_TAX_YEARS].sort((a, b) => a - b)).toEqual(yearsFromFiles);
  });

  it.each(yearFiles)('%s がloadTaxParamsの検証を通る', async (fileName) => {
    const year = Number(fileName.replace('.json', ''));
    stubFetchFor(fileName);

    const params = await loadTaxParams(year);

    expect(params.year).toBe(year);
  });

  it.each(yearFiles)('%s のmetaに出典と最終確認日がある(R-01/R-10)', (fileName) => {
    const params = JSON.parse(readFileSync(join(PARAMS_DIR, fileName), 'utf-8'));

    expect(Array.isArray(params.meta?.sources)).toBe(true);
    expect(params.meta.sources.length).toBeGreaterThan(0);
    for (const source of params.meta.sources) {
      expect(typeof source).toBe('string');
      expect(source.trim().length).toBeGreaterThan(0);
    }

    expect(params.meta.verifiedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(new Date(params.meta.verifiedAt).getTime())).toBe(false);
    // 未来日付は「確認済み」の意味を成さない
    expect(new Date(params.meta.verifiedAt).getTime()).toBeLessThanOrEqual(Date.now());
  });

  // 「verifiedAtから1年以上経過していないこと」はテストにしない。実行日次第で必ず落ちる時限テストになり、
  // 無関係なPRのCIを止めてしまうため。陳腐化の検知は実行時の警告(R-01、DashboardScreen)が担う。
});
