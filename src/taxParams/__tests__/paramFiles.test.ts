/**
 * public/taxParams/ に置かれた実データを、アプリと同じ経路(loadTaxParams)で検証する。
 * 新しい年分を追加したときに、スキーマ違反や meta の書き忘れを `npm run test` で捕まえるためのもの
 * (README「税制パラメータの追加・更新」の手順3が拠り所とするテスト)。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTaxParams } from '../loader';

const PARAMS_DIR = join(process.cwd(), 'public', 'taxParams');

/** 年分ファイルのみを対象にする(index.json のような付随ファイルは含めない) */
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
