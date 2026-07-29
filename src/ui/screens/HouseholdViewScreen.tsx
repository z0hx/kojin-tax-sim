import { useAppStore } from '../../store/useAppStore';
import { useNavigation } from '../navigation';
import { selectHouseholdSummary } from '../../store/selectors';

/**
 * S-11 世帯ビュー(02仕様書§5、Issue #14、FR-29)。複数人物(世帯メンバー)の上限額等を並べて
 * 一覧表示し、世帯合計を表示する。年度はactiveYearを使う(このアプリ全体の「現在表示中の年度」に揃える)。
 */
export function HouseholdViewScreen() {
  const navigate = useNavigation((s) => s.navigate);
  const appData = useAppStore((s) => s.appData);
  const activePersonId = useAppStore((s) => s.activePersonId);
  const activeYear = useAppStore((s) => s.activeYear);
  const taxParams = useAppStore((s) => s.taxParams);
  const lastError = useAppStore((s) => s.lastError);
  const clearLastError = useAppStore((s) => s.clearLastError);
  const linkSpouseIncome = useAppStore((s) => s.linkSpouseIncome);

  const errorBanner = lastError && (
    <div
      role="alert"
      style={{ marginTop: '1rem', background: 'var(--color-danger-bg)', color: 'var(--color-danger)', padding: '0.5rem', borderRadius: 4, fontSize: '0.85rem' }}
    >
      {lastError.message}
      <button type="button" onClick={clearLastError} style={{ marginLeft: '0.5rem' }}>
        閉じる
      </button>
    </div>
  );

  const summary = selectHouseholdSummary({ appData, taxParams }, activeYear);
  const availableEntries = summary.filter((s) => s.available);
  const totalLimit = availableEntries.reduce((sum, s) => sum + (s.limitAmount ?? 0), 0);
  const totalRecommended = availableEntries.reduce((sum, s) => sum + (s.recommendedAmount ?? 0), 0);

  return (
    <main style={{ maxWidth: 900, margin: '2rem auto', padding: '0 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button type="button" onClick={() => navigate('main')}>
          ← 戻る
        </button>
        <h1 style={{ margin: 0 }}>世帯ビュー{activeYear !== null ? ` (${activeYear}年分)` : ''}</h1>
      </div>
      {errorBanner}

      <table style={{ borderCollapse: 'collapse', width: '100%', marginTop: '1.5rem' }}>
        <thead>
          <tr>
            <th style={thStyle}>人物</th>
            <th style={thStyle}>上限額</th>
            <th style={thStyle}>推奨額</th>
            <th style={thStyle}>寄附済</th>
            <th style={thStyle}>残り</th>
            <th style={thStyle}>警告</th>
            <th style={thStyle}></th>
          </tr>
        </thead>
        <tbody>
          {summary.map((entry) => (
            <tr key={entry.personId}>
              <td style={tdStyle}>
                <span
                  aria-hidden="true"
                  style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: entry.color, marginRight: '0.4rem' }}
                />
                {entry.displayName}
              </td>
              {entry.available ? (
                <>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{entry.limitAmount!.toLocaleString()}円</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{entry.recommendedAmount!.toLocaleString()}円</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{entry.donated!.toLocaleString()}円</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <span className="amount">{entry.remaining!.toLocaleString()}円</span>
                  </td>
                  <td style={tdStyle}>{entry.warningCount! > 0 ? `⚠${entry.warningCount}` : '—'}</td>
                </>
              ) : (
                <td style={tdStyle} colSpan={5}>
                  データなし
                </td>
              )}
              <td style={tdStyle}>
                {entry.personId !== activePersonId && entry.available && (
                  <button type="button" onClick={() => linkSpouseIncome(entry.personId)}>
                    配偶者控除に連携
                  </button>
                )}
              </td>
            </tr>
          ))}
          <tr>
            <td style={{ ...tdStyle, fontWeight: 700 }}>世帯計</td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
              <span className="amount">{totalLimit.toLocaleString()}円</span>
            </td>
            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>
              <span className="amount">{totalRecommended.toLocaleString()}円</span>
            </td>
            <td style={tdStyle} />
            <td style={tdStyle} />
            <td style={tdStyle} />
            <td style={tdStyle} />
          </tr>
        </tbody>
      </table>
      <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
        「配偶者控除に連携」は、その人物の合計所得金額を現在アクティブな人物(
        {appData?.persons.find((p) => p.id === activePersonId)?.displayName ?? '—'})の配偶者控除判定へコピーします。
      </p>
    </main>
  );
}

const thStyle = { textAlign: 'left' as const, padding: '0.4rem 0.8rem', borderBottom: '2px solid var(--color-border)' };
const tdStyle = { padding: '0.4rem 0.8rem', borderBottom: '1px solid var(--color-border)' };
