# Contributing

このリポジトリへの変更を検討してくれてありがとう。個人用ツールとして育ってきた経緯があるため、
一般的なOSSより前提知識が要る部分がある。ここではその前提を埋める。

## 開発環境

Go以外の依存はない（npm/ビルドツール不要）。

```
go run ./cmd/server
```

`http://127.0.0.1:8787` にサーバーが立ち上がり、既定のブラウザが自動で開く。

`web/` はビルド時にバイナリへ埋め込まれる（`webassets.go`）。`go run` はコマンド自体が毎回
ソースから再ビルドするため、HTML/JSを編集したら `go run` を再実行すること——プロセスを
起動したまま `web/` だけ書き換えてブラウザをリロードしても変更は反映されない。

## ⚠️ 実データについて（最初に必ず読んでほしい）

`data/*.json`（`graph.json`/`loadouts.json`/`collections.json`/`standing.json`/`stats.json`/
`glossary.json`）はリポジトリ作者本人の実際のプレイ進行データで、**gitで追跡されている**。
`go run ./cmd/server` をそのまま実行すると、動作確認のクリックがこのファイルを直接書き換える。

コードの動作確認は、`data/` ごと別ディレクトリへコピーしてポートを変えたインスタンスで行うこと:

```bash
# 1. リポジトリ全体を作業用ディレクトリへコピー（.gitは除外してよい）
cp -r cmd pkg web go.mod webassets.go data /path/to/scratch/
# 2. コピー先の cmd/server/main.go でポート番号だけ変える（127.0.0.1:8787 → 別の空きポート）
# 3. コピー先で go build && ./server を実行し、そちらで確認する
```

PRの差分に `data/*.json` の変更が紛れ込んでいないか、`git diff` で必ず確認してから提出してほしい。
新しいノード種別やフィールドを試すためのサンプルデータが必要な場合は、PRの説明にその旨を書いて
テストデータであることを明示するか、`_test.go` 内のフィクスチャとして持たせてほしい。

## コーディング規約・設計原則

- **flat DAGモデル**: `pkg/model.Node` はフラットなノード集合＋有向エッジ（`requires`/`contains`）
  で完結させる。`contains` はUI上のグループ化表現に限定し、達成状態（`satisfied`）の意味論には
  一切関与しない（`requires` のみが「前提が終わっていること」を意味する）。
- **各データ種別は独立したFileStore**: `pkg/loadout`/`pkg/collection`/`pkg/standing`/`pkg/stats`/
  `pkg/glossary`/`pkg/scratch` はいずれも `pkg/persist` 共通の単一JSONファイル永続化パターン
  （アトミック書き込み・世代バックアップ）を使う。新しいデータ種別を追加するときはこのどれかを
  テンプレートにするのが早い。
- **Web UIはVanilla HTML/CSS/JS**: フレームワーク・ビルドステップなし。絵文字はUIアイコンとして
  使わない（Lucideアイコン、`web/icons.js`）。テーマ（ライト/ダーク）はCSS変数（`--panel`/
  `--accent`等）で切り替わる設計なので、色は決め打ちせず変数を使うこと。
- **全ページ共通ウィジェットは自己完結スクリプト**: `web/booster.js`/`web/scratch.js`等、複数
  ページで使う機能は単一の `<script>` として実装し、各ページの `</body>` 直前で読み込むだけで
  動くようにする（`icons.js` の `getTopRightBar()` で右上共有バーへボタンを追加する等）。

## ネタバレ配慮が要る変更

このアプリはWarframeのゲームデータをそのまま扱うため、機能によっては「その機能が存在すること
自体」が未プレイのプレイヤーへのネタバレになる（例: Focus School/Railjack関連機能は、それらが
アンロックされる大きなストーリー展開の前提クエストをクリアするまで、機能名自体を隠す設計に
なっている）。

新しいセクションを追加する際、それが特定のメインストーリークエスト（`pkg/questchain`を参照）を
前提とする機能なら、`web/stats.html` の `initCollapsiblePanel()` と同じパターン（前提クエスト
未クリアの間は機能名を伏せて折りたたむ）を適用してほしい。既存の4実装（Focus School / Railjack
本体 / Railjack Intrinsics / Drifter Intrinsics）がリファレンスになる。

## テスト・ビルド確認

PRを出す前に以下を通しておくこと（CIでも同じチェックが走る）。

```bash
go build ./...
go vet ./...
gofmt -l .          # 出力が空であること
go test ./...
```

## コードオーナー

`pkg/engine/`（DAG探索・Next Action導出）と `pkg/model/`（flat DAGの型定義）はこのプロジェクトの
核となる設計判断が詰まっている領域のため、`.github/CODEOWNERS` で作者のレビューを必須にしている。
他の領域は通常のPRフローで問題ない。

## PR

- 1つのPRは1つの変更にまとめる（機能追加とリファクタを混ぜない）。
- コミットメッセージは [Conventional Commits](https://www.conventionalcommits.org/)
  （`feat(scope): ...` / `fix(scope): ...` / `docs: ...` 等）に沿っていると読みやすい。
- 設計判断の背景を聞きたい場合はIssueで気軽に質問してほしい。
