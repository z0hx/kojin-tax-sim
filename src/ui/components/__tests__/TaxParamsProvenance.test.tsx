// @vitest-environment jsdom
/**
 * 税制パラメータの出所表示(R-10)のテスト。最終確認日・出典・注記の開示と、
 * 1年以上未確認の場合の表示切替(R-01と同じ判定)を確認する。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

import { TaxParamsProvenance } from '../TaxParamsProvenance';
import params2026 from '../../../../public/taxParams/2026.json';
import type { TaxParams } from '../../../taxParams/schema';

const params = params2026 as unknown as TaxParams;

function withVerifiedAt(verifiedAt: string): TaxParams {
  return { ...params, meta: { ...params.meta, verifiedAt } };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('TaxParamsProvenance', () => {
  it('最終確認日・出典・注記を開示する', () => {
    render(<TaxParamsProvenance params={params} />);

    expect(screen.getByText(params.meta.verifiedAt)).toBeInTheDocument();
    for (const source of params.meta.sources) {
      expect(screen.getByText(source)).toBeInTheDocument();
    }
    expect(screen.getByText('要確認パラメータ・注記')).toBeInTheDocument();
  });

  it('最終確認日からの経過日数を表示する', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 29));

    render(<TaxParamsProvenance params={withVerifiedAt('2026-07-26')} />);

    expect(screen.getByText(/3日前/)).toBeInTheDocument();
  });

  it('1年以内なら陳腐化の注意書きを出さない', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 1));

    render(<TaxParamsProvenance params={withVerifiedAt('2026-07-26')} />);

    expect(screen.queryByText(/1年以上確認されていません/)).not.toBeInTheDocument();
  });

  it('1年以上経過していたら陳腐化の注意書きを出す', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2028, 0, 1));

    render(<TaxParamsProvenance params={withVerifiedAt('2026-07-26')} />);

    expect(screen.getByText(/1年以上確認されていません/)).toBeInTheDocument();
  });

  it('notesが無いパラメータでも表示できる', () => {
    const noNotes = { ...params, meta: { sources: params.meta.sources, verifiedAt: params.meta.verifiedAt } };
    render(<TaxParamsProvenance params={noNotes} />);

    expect(screen.queryByText('要確認パラメータ・注記')).not.toBeInTheDocument();
    expect(screen.getByText(params.meta.verifiedAt)).toBeInTheDocument();
  });
});
