/**
 * 現時点ではPhase 0(基盤)+Phase 1(計算エンジン)のみ実装済みで、
 * 画面(S-01〜S-12)は未実装のプレースホルダ。ビルドパイプラインが通ることの確認用。
 */
export default function App() {
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: '2rem', maxWidth: 640, margin: '0 auto' }}>
      <h1>TaxSim</h1>
      <p>個人税額・ふるさと納税上限シミュレータ</p>
      <p>計算エンジンと永続化層の実装が完了しています。画面(UI)は今後のフェーズで実装予定です。</p>
      <footer style={{ marginTop: '3rem', fontSize: '0.85rem', color: '#555' }}>
        本アプリの出力は概算であり、税務上の助言ではありません。実際の申告・納税額は、税務署または税理士にご確認ください。
      </footer>
    </div>
  );
}
