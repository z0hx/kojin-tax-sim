import type { CalculationResult } from '../../domain/types';

interface CapDetail {
  ratioBased: number;
  fixed: number;
  /** 比率(例: 0.05)。表示ラベル("課税総所得×5%")の算出にのみ使う */
  ratio: number;
}

interface HousingLoanBreakdownProps {
  housingLoan: CalculationResult['housingLoan'];
  capDetail: CapDetail;
}

function pct(part: number, total: number): number {
  return total > 0 ? (part / total) * 100 : 0;
}

/**
 * S-04 住宅ローン控除の可視化(Issue #8完了条件: 切り捨て損失を金額として可視化する)。
 * 控除可能額を「所得税から控除/住民税から控除/切り捨て」の3区分の積み上げ棒で示す。
 * 切り捨てはdatavizスキルのstatus(critical)相当のためアプリ既存の--color-dangerを再利用し、
 * 色のみに頼らず⚠アイコン+ラベルを併記する(色覚多様性対応)。
 */
export function HousingLoanBreakdown({ housingLoan, capDetail }: HousingLoanBreakdownProps) {
  const { creditAvailable, usedInIncomeTax, wasted } = housingLoan;
  const usedInResident = (housingLoan.carriedToResidentTax - wasted) as number;

  if (creditAvailable <= 0) {
    return <p style={{ color: 'var(--color-muted)' }}>住宅ローン控除の入力がないか、控除可能額が0円のため可視化はありません。</p>;
  }

  return (
    <div>
      <p style={{ margin: '0 0 0.5rem' }}>
        控除可能額: <span className="amount">{creditAvailable.toLocaleString()}円</span>
      </p>
      <div
        role="img"
        aria-label={`控除可能額${creditAvailable.toLocaleString()}円の内訳。所得税から控除${usedInIncomeTax.toLocaleString()}円、住民税から控除${usedInResident.toLocaleString()}円、切り捨て${wasted.toLocaleString()}円`}
        style={{
          display: 'flex',
          height: '1.75rem',
          borderRadius: 4,
          overflow: 'hidden',
          border: '1px solid var(--color-border)',
        }}
      >
        {usedInIncomeTax > 0 && (
          <div
            title={`所得税から控除 ${usedInIncomeTax.toLocaleString()}円`}
            style={{ width: `${pct(usedInIncomeTax, creditAvailable)}%`, background: 'var(--color-series-1)', marginRight: usedInResident > 0 || wasted > 0 ? 2 : 0 }}
          />
        )}
        {usedInResident > 0 && (
          <div
            title={`住民税から控除 ${usedInResident.toLocaleString()}円`}
            style={{ width: `${pct(usedInResident, creditAvailable)}%`, background: 'var(--color-series-2)', marginRight: wasted > 0 ? 2 : 0 }}
          />
        )}
        {wasted > 0 && (
          <div title={`切り捨て ${wasted.toLocaleString()}円`} style={{ width: `${pct(wasted, creditAvailable)}%`, background: 'var(--color-danger)' }} />
        )}
      </div>

      <ul style={{ listStyle: 'none', margin: '0.75rem 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--color-series-1)', flexShrink: 0 }} aria-hidden="true" />
          所得税から控除 <span className="amount">{usedInIncomeTax.toLocaleString()}円</span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--color-series-2)', flexShrink: 0 }} aria-hidden="true" />
          住民税から控除 <span className="amount">{usedInResident.toLocaleString()}円</span>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-muted)' }}>
            (上限 {capDetail.fixed.toLocaleString()}円 / 課税総所得×{Math.round(capDetail.ratio * 100)}% = {capDetail.ratioBased.toLocaleString()}円 → 適用{' '}
            {housingLoan.residentTaxCap.toLocaleString()}円)
          </span>
        </li>
        <li style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: 'var(--color-danger)', flexShrink: 0 }} aria-hidden="true" />
          切り捨て <span className="amount">{wasted.toLocaleString()}円</span>
          {wasted > 0 && <span style={{ color: 'var(--color-danger)' }}>⚠</span>}
        </li>
      </ul>
    </div>
  );
}
