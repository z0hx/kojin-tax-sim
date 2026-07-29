import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadTaxParams, TaxParamsError, isTaxParamsStale } from '../loader';
import { stubFetchForTaxParams } from '../../store/__tests__/testUtils';
import type { TaxParams } from '../schema';

function minimalParams(year: number): TaxParams {
  return { year, meta: { sources: [], verifiedAt: '2026-01-01' } } as unknown as TaxParams;
}

describe('loadTaxParams', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('成功時はTaxParamsを返す', async () => {
    stubFetchForTaxParams();
    const params = await loadTaxParams(2026, '/base/');
    expect(params.year).toBe(2026);
  });

  it('未知の年(fixtureに無い)や明示的なfail指定はTaxParamsErrorを投げる', async () => {
    stubFetchForTaxParams({ 2026: 'fail' });
    await expect(loadTaxParams(2026, '/base/')).rejects.toBeInstanceOf(TaxParamsError);
    await expect(loadTaxParams(2026, '/base/')).rejects.toMatchObject({ year: 2026 });
  });

  it('fetch自体が例外を投げた場合(オフライン等)もTaxParamsErrorを投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    await expect(loadTaxParams(2026, '/base/')).rejects.toBeInstanceOf(TaxParamsError);
    await expect(loadTaxParams(2026, '/base/')).rejects.toMatchObject({ year: 2026 });
  });

  it('JSONとして解釈できない場合はTaxParamsErrorを投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not json', { status: 200 }))
    );
    await expect(loadTaxParams(2026, '/base/')).rejects.toMatchObject({ year: 2026 });
  });

  it('年分が期待値と異なる場合はTaxParamsErrorを投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(minimalParams(2025)), { status: 200 }))
    );
    await expect(loadTaxParams(2026, '/base/')).rejects.toMatchObject({ year: 2026 });
  });

  it('住民税の標準税率が欠けている場合はTaxParamsErrorを投げる(ふるさと納税20%枠の基準がNaNになるため)', async () => {
    const broken = { ...minimalParams(2026), residentTax: { municipalIncomeRateStandard: 0.06 } } as unknown as TaxParams;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(broken), { status: 200 }))
    );
    await expect(loadTaxParams(2026, '/base/')).rejects.toMatchObject({
      year: 2026,
      message: expect.stringContaining('prefecturalIncomeRateStandard'),
    });
  });

  it('baseUrlを既定値のまま呼ぶとルート相対パスでfetchする', async () => {
    stubFetchForTaxParams();
    await loadTaxParams(2026);
    expect(fetch).toHaveBeenCalledWith('/taxParams/2026.json');
  });
});

describe('isTaxParamsStale', () => {
  it('verifiedAtから1年未満なら false', () => {
    const params = minimalParams(2026);
    params.meta.verifiedAt = '2026-01-01';
    expect(isTaxParamsStale(params, new Date('2026-06-01'))).toBe(false);
  });

  it('verifiedAtから1年以上経過していれば true', () => {
    const params = minimalParams(2026);
    params.meta.verifiedAt = '2025-01-01';
    expect(isTaxParamsStale(params, new Date('2026-06-01'))).toBe(true);
  });
});
