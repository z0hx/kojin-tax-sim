// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { describeTaxParamsUnavailable } from '../defaults';

describe('describeTaxParamsUnavailable(Issue #15完了条件: fail closedの方針を文言として集約する)', () => {
  afterEach(() => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  it('オンライン時は詳細メッセージを含める', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    const msg = describeTaxParamsUnavailable(2026, 'Failed to fetch');
    expect(msg).toContain('2026年分');
    expect(msg).toContain('Failed to fetch');
    expect(msg).toContain('計算結果は表示されません');
  });

  it('オフライン時は利用可能なキャッシュが無い旨の案内を返す', () => {
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
    const msg = describeTaxParamsUnavailable(2026, 'Failed to fetch');
    expect(msg).toContain('オフライン');
    expect(msg).toContain('キャッシュがありません');
  });
});
