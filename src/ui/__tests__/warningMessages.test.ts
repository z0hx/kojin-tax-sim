import { describe, expect, it } from 'vitest';
import { resolveWarningMessage } from '../warningMessages';

describe('resolveWarningMessage(Issue #9: messageKey→文言変換の共通化)', () => {
  it('W-01: パラメータ無しの文言を返す', () => {
    expect(resolveWarningMessage({ messageKey: 'warning.housingLoanZeroesIncomeTax' })).toContain('所得税額が0円');
  });

  it('W-02: wastedパラメータが金額として埋め込まれる', () => {
    const msg = resolveWarningMessage({ messageKey: 'warning.housingLoanWasted', params: { wasted: 40_000 } });
    expect(msg).toContain('40,000');
  });

  it('W-03: beforeとafterの両方が金額として埋め込まれる', () => {
    const msg = resolveWarningMessage({ messageKey: 'warning.donationIncreasesWasted', params: { before: 10_000, after: 25_000 } });
    expect(msg).toContain('10,000');
    expect(msg).toContain('25,000');
  });

  it('W-04: MedicalDeductionFormが直書きしていたのと同じ文言を返す(実装後レビュー申し送り対応)', () => {
    expect(resolveWarningMessage({ messageKey: 'warning.oneStopInvalidWithMedical' })).toBe(
      '医療費控除があるためワンストップ特例は利用できません(確定申告が必要です)。'
    );
  });

  it('W-06: confidenceRatioがパーセント表記に変換される', () => {
    const msg = resolveWarningMessage({ messageKey: 'warning.lowConfidence', params: { confidenceRatio: 0.25 } });
    expect(msg).toContain('25%');
  });

  it('未知のmessageKeyはそのまま返す(フォールバック)', () => {
    expect(resolveWarningMessage({ messageKey: 'warning.unknownKey' })).toBe('warning.unknownKey');
  });
});
