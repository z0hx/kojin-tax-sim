# kojin-tax-sim（TaxSim）

個人税額・ふるさと納税上限シミュレータ。育児休業・住宅ローン控除・医療費控除など複数の控除が重なる状況でも、寄附あり／なしの実額を二重計算し、その差分から「自己負担2,000円で収まる寄附上限額」を根拠付きで算出することを目指すプロジェクトです。

サーバーサイド処理なしの静的サイトとして GitHub Pages 上で配信します。詳細な要件・仕様は [`docs/`](./docs) 以下を参照してください。

- [要件定義書](./docs/01_要件定義書_税額シミュレータ.md)
- [仕様書](./docs/02_仕様書_税額シミュレータ.md)
- [詳細設計書](./docs/03_詳細設計書_税額シミュレータ.md)

> 本アプリの出力は概算であり、税務上の助言ではありません。実際の申告・納税額は、税務署または税理士にご確認ください。

## 検算（実績値との突合）について

計算エンジンの信頼性を確認する最重要のマイルストーンとして、実際の源泉徴収票・住民税決定通知書の実額と本アプリの計算結果を突き合わせる「検算モード」画面（メニューの「検算」）を用意しています。

**運用ルール（仕様書§7.3）**: ご自身の実績値を検算モードに入力し、すべての項目で誤差が±1%以内であることを確認できるまでは、本アプリの出力額（特にふるさと納税の上限額・推奨額）を実際の寄附・申告の意思決定には使用しないでください。誤差が±1%を超える項目がある間は、ダッシュボード画面にその旨の注意表示が常時出ます。

検算モードに入力した実績値は、他の入力データと同様にこの端末のブラウザ内（IndexedDB）にのみ保存され、外部に送信されることはありません。本リポジトリはpublicリポジトリのため、実際の源泉徴収票・住民税決定通知書の数値をテストコードや設定ファイル等にコミットすることはしていません（検算のロジック自体は架空の数値を用いたテストで検証しています）。

## 現在の実装状況

- 計算エンジン（`src/domain`）・永続化層（`src/persistence`）・税制パラメータローダー（`src/taxParams`）は実装済み
- 画面（UI）は未実装のプレースホルダ（`src/App.tsx`）。ビルドパイプラインが通ることの確認用

## 税制パラメータの追加・更新

税率表・控除額は年分ごとの JSON（`public/taxParams/{年}.json`）で管理しています。アプリ内に編集画面は設けていません。パラメータの誤りは上限額の誤りに直結するため、出典と最終確認日が紐づかない値を使えないようにする意図です（要件定義書§6.4）。

新しい年分を追加する手順:

1. `public/taxParams/{年}.json` を追加する。形は `src/taxParams/schema.ts` の `TaxParams` に従う（前年のファイルをコピーして差分を当てるのが確実です）。
2. `meta` を必ず更新する。
   - `sources`: 参照した一次情報（国税庁・総務省など）
   - `verifiedAt`: 確認した日付（`YYYY-MM-DD`）。この日から1年以上経過すると、アプリが起動画面で警告を出します（R-01）
   - `notes`: 断定できなかったパラメータがあれば明記する。計算明細画面でそのまま利用者に開示されます
3. `npm run test` を実行する。`src/taxParams/__tests__` がスキーマと必須項目を検証します。
4. `main` へマージすると GitHub Pages へデプロイされ、その年分が計算可能になります。

パラメータJSONが存在しない年度のプロファイルを作ると、計算は実行されずエラーが表示されます（誤った値で計算を続けるより計算不能を明示する方針。詳細設計書§8）。

自治体ごとに異なる超過課税率・均等割は税制パラメータではなく自治体設定として扱っており、アプリの「基本設定」画面から利用者が変更できます。

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
