import { useRegisterSW } from 'virtual:pwa-register/react';

/** NFR-14・R-10: Service Workerが新バージョンを検知した際に、自動更新でなく明示的な
 *  再読み込みを促す。registerType:'prompt'(vite.config.ts)と対応する。 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError: (error) => {
      console.error('Service Workerの登録に失敗しました', error);
    },
  });

  if (!needRefresh && !offlineReady) return null;

  const close = () => {
    setNeedRefresh(false);
    setOfflineReady(false);
  };

  return (
    <div
      role="status"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 1rem',
        background: 'var(--color-warning-bg)',
        color: 'var(--color-warning)',
        fontSize: '0.85rem',
      }}
    >
      {needRefresh ? (
        <>
          <span>新しいバージョンが利用可能です。税制パラメータが更新されている場合があります。</span>
          <button type="button" onClick={() => void updateServiceWorker(true)}>
            再読み込み
          </button>
        </>
      ) : (
        <span>オフラインでも利用できるようになりました。</span>
      )}
      <button type="button" onClick={close} style={{ marginLeft: 'auto' }}>
        閉じる
      </button>
    </div>
  );
}
