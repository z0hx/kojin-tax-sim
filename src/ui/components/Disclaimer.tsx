/** NFR-09: 全画面共通で表示する免責事項 */
export function Disclaimer() {
  return (
    <footer style={{ padding: '1rem', fontSize: '0.85rem', color: 'var(--color-muted)' }}>
      本アプリの出力は概算であり、税務上の助言ではありません。実際の申告・納税額は、税務署または税理士にご確認ください。
    </footer>
  );
}
