.DEFAULT_GOAL := help
.PHONY: help install dev build preview test test-watch coverage typecheck ci clean

help: ## このヘルプを表示
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## 依存関係をインストール(package-lock.json に厳密準拠)
	npm ci

dev: ## 開発サーバーを起動
	npm run dev

build: ## 型チェック後、本番ビルドを生成(dist/)
	npm run build

preview: ## ビルド成果物をローカルでプレビュー
	npm run preview

test: ## テストを一度だけ実行
	npm run test

test-watch: ## テストをウォッチモードで実行
	npm run test:watch

coverage: ## カバレッジ付きでテストを実行
	npm run test:coverage

typecheck: ## 型チェックのみ実行
	npm run typecheck

ci: install typecheck test build ## CIと同じ手順(install → typecheck → test → build)をローカルで実行

clean: ## ビルド成果物とキャッシュを削除
	rm -rf dist coverage
