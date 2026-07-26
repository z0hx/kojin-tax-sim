# kojin-tax-sim（TaxSim）

個人税額・ふるさと納税上限シミュレータ。育児休業・住宅ローン控除・医療費控除など複数の控除が重なる状況でも、寄附あり／なしの実額を二重計算し、その差分から「自己負担2,000円で収まる寄附上限額」を根拠付きで算出することを目指すプロジェクトです。

サーバーサイド処理なしの静的サイトとして GitHub Pages 上で配信します。詳細な要件・仕様は [`docs/`](./docs) 以下を参照してください。

- [要件定義書](./docs/01_要件定義書_税額シミュレータ.md)
- [仕様書](./docs/02_仕様書_税額シミュレータ.md)
- [詳細設計書](./docs/03_詳細設計書_税額シミュレータ.md)

> 本アプリの出力は概算であり、税務上の助言ではありません。実際の申告・納税額は、税務署または税理士にご確認ください。

## 現在の実装状況

- 計算エンジン（`src/domain`）・永続化層（`src/persistence`）・税制パラメータローダー（`src/taxParams`）は実装済み
- 画面（UI）は未実装のプレースホルダ（`src/App.tsx`）。ビルドパイプラインが通ることの確認用

## 技術スタック

- React 18 + TypeScript（strict）
- Vite（ビルド／開発サーバー）
- Zustand（状態管理）
- idb（IndexedDB ラッパー、永続化）
- Vitest（テスト・カバレッジ）

## セットアップ

### 前提

- Node.js 20 以上
- npm

### インストール

```bash
npm ci
# もしくは
make install
```

### 開発サーバー起動

```bash
npm run dev
# もしくは
make dev
```

`http://localhost:5173` で起動します。

## 主なコマンド

npm scripts と `make` ターゲットのどちらからでも実行できます（`make help` で一覧表示）。

| 内容 | npm | make |
|---|---|---|
| 依存関係インストール | `npm ci` | `make install` |
| 開発サーバー起動 | `npm run dev` | `make dev` |
| 型チェック＋本番ビルド | `npm run build` | `make build` |
| ビルド成果物のプレビュー | `npm run preview` | `make preview` |
| テスト実行（一度だけ） | `npm run test` | `make test` |
| テスト実行（ウォッチ） | `npm run test:watch` | `make test-watch` |
| カバレッジ計測 | `npm run test:coverage` | `make coverage` |
| 型チェックのみ | `npm run typecheck` | `make typecheck` |
| CI相当の一括実行 | - | `make ci` |
| ビルド成果物の削除 | - | `make clean` |

## プロジェクト構成

```
kojin-tax-sim/
├── .github/workflows/  # CI・GitHub Pagesデプロイ
├── docs/                # 要件定義書・仕様書・詳細設計書
├── public/taxParams/    # 年度別税制パラメータ（JSON）
├── src/
│   ├── domain/           # 計算エンジン（純粋関数）
│   ├── persistence/       # IndexedDB・移行・エクスポート/インポート
│   ├── taxParams/          # 税制パラメータのロード・スキーマ検証
│   ├── App.tsx
│   └── main.tsx
├── Makefile
├── vite.config.ts
└── package.json
```

## テスト

Vitest を使用しています。テスト対象は `src/domain`（計算エンジン）と `src/persistence`（永続化層）です。

```bash
make test        # 一度だけ実行
make test-watch   # ウォッチモード
make coverage     # カバレッジ付き
```

## CI/CD

`.github/workflows/` に2つのワークフローがあります。

- **`ci.yml`**: pull request 作成時・`main` への push 時に、型チェック・テスト・ビルドを実行します。
- **`deploy.yml`**: `main` への push 時（または手動実行）に、テストが通ったビルド成果物を GitHub Pages へデプロイします。テストが失敗した場合はデプロイされません。

GitHub Pages でサブパス配信（`https://<user>.github.io/kojin-tax-sim/`）するため、`vite.config.ts` の `base` は `VITE_BASE` 環境変数（未設定時は `/kojin-tax-sim/`）から取得しています。

初回デプロイ時は、リポジトリの Settings > Pages で Source を「GitHub Actions」に設定してください。
