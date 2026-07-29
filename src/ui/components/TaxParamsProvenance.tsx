import type { TaxParams } from '../../taxParams/schema';
import { isTaxParamsStale } from '../../taxParams/loader';
import { daysSinceDateOnly } from '../dateUtils';

/**
 * 税制パラメータの出所表示(R-10「アプリ内に『パラメータ最終確認日』を常時表示」)。
 * 最終確認日・出典・要確認事項(meta.notes)を開示する。R-01の陳腐化警告と同じ判定
 * (`isTaxParamsStale`)を使い、1年以上未確認なら表示自体を警告色に切り替える。
 */
export function TaxParamsProvenance({ params }: { params: TaxParams }) {
  const stale = isTaxParamsStale(params);
  const elapsedDays = daysSinceDateOnly(params.meta.verifiedAt);

  return (
    <section style={{ marginTop: '1.5rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
      <h2 style={{ fontSize: '1rem', color: 'var(--color-fg)' }}>税制パラメータの出所(R-10)</h2>
      <p style={{ margin: '0.2rem 0', color: stale ? 'var(--color-warning)' : undefined }}>
        {params.year}年分 最終確認日: <span className="amount">{params.meta.verifiedAt}</span>
        {elapsedDays >= 0 && `(${elapsedDays.toLocaleString()}日前)`}
        {stale && ' ⚠ 1年以上確認されていません'}
      </p>
      <p style={{ margin: '0.2rem 0' }}>出典:</p>
      <ul style={{ margin: '0.2rem 0', paddingLeft: '1.2rem' }}>
        {params.meta.sources.map((source) => (
          <li key={source}>{source}</li>
        ))}
      </ul>
      {params.meta.notes && (
        <details>
          <summary>要確認パラメータ・注記</summary>
          <p style={{ margin: '0.4rem 0' }}>{params.meta.notes}</p>
        </details>
      )}
    </section>
  );
}
