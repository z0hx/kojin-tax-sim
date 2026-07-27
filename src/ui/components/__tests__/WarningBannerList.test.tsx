// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { WarningBannerList } from '../WarningBannerList';
import type { Warning } from '../../../domain/types';

afterEach(cleanup);

describe('WarningBannerList(Issue #9完了条件: W-01〜W-08が正しい条件で発火し表示される)', () => {
  it('警告が無い場合はその旨のメッセージを表示する', () => {
    render(<WarningBannerList warnings={[]} />);
    expect(screen.getByText('現在、警告はありません。')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('各警告がid・文言とともに表示される', () => {
    const warnings: Warning[] = [
      { id: 'W-04', severity: 'critical', messageKey: 'warning.oneStopInvalidWithMedical' },
      { id: 'W-07', severity: 'info', messageKey: 'warning.specialCapReached' },
    ];
    render(<WarningBannerList warnings={warnings} />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    expect(screen.getByText('W-04')).toBeInTheDocument();
    expect(screen.getByText(/ワンストップ特例は利用できません/)).toBeInTheDocument();
    expect(screen.getByText('W-07')).toBeInTheDocument();
    expect(screen.getByText(/20%上限に達しています/)).toBeInTheDocument();
  });

  it('severityに応じて異なる色スタイルが適用される(critical/caution/infoを色のみに頼らずid+アイコンでも区別できる)', () => {
    const warnings: Warning[] = [
      { id: 'W-01', severity: 'critical', messageKey: 'warning.housingLoanZeroesIncomeTax' },
      { id: 'W-02', severity: 'caution', messageKey: 'warning.housingLoanWasted', params: { wasted: 1000 } },
      { id: 'W-08', severity: 'info', messageKey: 'warning.housingLoanYearEndAdjustmentReminder' },
    ];
    render(<WarningBannerList warnings={warnings} />);
    const alerts = screen.getAllByRole('alert');
    expect(alerts[0]).toHaveStyle({ color: 'var(--color-danger)' });
    expect(alerts[1]).toHaveStyle({ color: 'var(--color-warning)' });
    expect(alerts[2]).toHaveStyle({ color: 'var(--color-fg)' });
  });
});
