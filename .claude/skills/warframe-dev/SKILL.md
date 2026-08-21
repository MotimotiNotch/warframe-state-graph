---
name: warframe-dev
description: Warframe State Graphのコード変更・機能追加・バグ修正を行う際の開発ワークフロー。実データ(data/*.json)を壊さない隔離検証手順、既存パッケージ構成に沿った新規データ種別の追加パターン、ネタバレゲーティングの実装パターン、コミット前チェックリストをカバーする。このリポジトリのソースを編集する・動作確認する・新機能を追加する時に使用する。
---

# Warframe State Graph 開発ワークフロー

Go単体（フレームワーク・ビルドツールなし）のローカルWebアプリ。`web/`はビルド時に
`webassets.go`でバイナリへ埋め込まれる。設計思想の詳細（なぜflat DAGか等）はこのリポジトリの
外（作者のプライベートVault）で管理されているため、ここには実務的な手順のみを置く。
README.mdとCONTRIBUTING.mdも合わせて読むこと。

## ⚠️ 最優先: 実データ(`data/*.json`)を壊さない

`data/graph.json`/`loadouts.json`/`collections.json`/`standing.json`/`stats.json`/`glossary.json`
はリポジトリ作者の実際のプレイ進行データで、gitに追跡されている。**動作確認のためだけに本番の
`go run ./cmd/server`を直接叩かない。** 必ず以下の隔離手順で行う。

```bash
# 1. コード一式(dataも含む)を作業ディレクトリへコピー
SCRATCH=/path/to/scratch  # OSの一時ディレクトリ等、リポジトリ外
cp -r cmd pkg web go.mod webassets.go data "$SCRATCH/"

# 2. コピー先の cmd/server/main.go のポートだけ書き換える(本番8787との衝突回避)
sed -i 's/127.0.0.1:8787/127.0.0.1:8799/' "$SCRATCH/cmd/server/main.go"

# 3. コピー先でビルド・起動し、そちらで動作確認する
cd "$SCRATCH" && go build -o server.exe ./cmd/server && ./server.exe
```

**再同期の落とし穴**: 変更を重ねて複数回コピーし直す場合、`cmd/server/main.go`も毎回
本番の8787で上書きされる。再ビルド前に必ずポート書き換えをやり直すこと（起動時に
`listen tcp 127.0.0.1:8787: bind: ...`のエラーが出たら、これを疑う）。

作業が終わったら、実際にコミットする前に本番リポジトリ側で `git diff --stat` を見て
`data/*.json`が変更されていないことを確認する。変更が必要な実データ操作（新フィールドの
既定値埋め込み等）は例外的にあり得るが、その場合は差分の中身を読んで意図した変更だけか
確認してからコミットする。

## ビルド・検証コマンド

```bash
go build ./cmd/server   # ./... ではなくcmd/serverを明示（複数main衝突を避ける）
go vet ./...
gofmt -l .              # 出力が空であること
go test ./...
```

## 新しいデータ種別を追加するパターン

このリポジトリの各データ種別（Loadouts/Collections/Standing/Stats/Glossary/Scratch）は
すべて同じ形の3点セットでできている。新規追加時はこれをそのまま模倣すればよい。

1. `pkg/<name>/model.go`: データ構造体 + `NewData()`
2. `pkg/<name>/store.go`: `pkg/persist`を使う`FileStore`（`Load`/`SetXxx`/`UpsertXxx`等）
3. `cmd/server/main.go`: `<name>Path := filepath.Join(root, "data", "<name>.json")` →
   `xs := <name>.NewFileStore(<name>Path)` → `GET/POST/PUT/DELETE /api/<name>...`のハンドラー

最も新しく単純な例は`pkg/scratch`（自由記述メモ＋カウンター）。`pkg/loadout`は複数エンティティ
（Item/BuildSet）を持つ場合の参考になる。

## UIを追加・変更する時のデザイン原則

新規ページ・新規セクションを作る前に、まず既存ページ（`web/standing.html`が一番素直な参考例）
の類似要素のCSSクラスをそのまま流用できないか確認する。ゼロから新しい見た目を作らない。

- **音量差**: 操作頻度の低い要素（凡例・補足説明）は常時表示せず、折りたたみ/ポップオーバー/
  アイコン化で格下げする。1画面の全要素を同じ強さで並べない。
- **生データでなく状態として見せる**: 属性は生テキストの羅列でなく、バッジ/アイコン/カラー
  コード（CSS変数 `--satisfied`/`--actionable`等）で表現する。
- **絵文字はUIアイコンとして使わない**: `web/icons.js`のLucideアイコンセットを使う。
- **全ページ共通のCSS変数を再定義しない**: `--panel`/`--accent`/`--border`等は各ページの
  `<style>`冒頭で同じ値を持っている。新しいトークンが必要な場合以外は既存のものを使う。

## ネタバレゲーティングパターン

新セクションが特定のメインストーリークエスト（`pkg/questchain.MainStoryChain`参照）を前提と
する機能なら、`web/stats.html`の`initCollapsiblePanel(prefix, questName, revealedTitle)`と
同じ仕組みを適用する——**機能の存在自体がネタバレになりうる**ため、前提クエスト未クリアの間は
`revealedTitle`を出さず「未解放セクション」というプレースホルダーのまま折りたたむ。

既存4実装（Focus School / Railjack本体 / Railjack Intrinsics / Drifter Intrinsics）が
`web/stats.html`内にリファレンスとしてある。同じファイルにこの機構自体の実装コメントもある。

このゲーティングは「機能名を含むh2/h3見出しテキスト」だけでなく、**同じページの他の場所
（ヘルプポップオーバーの説明文、他ページのnav案内文等）に同じ機能名が漏れていないか**も
セットで確認すること——過去に一度、Intrinsicsパネルだけこの保護が漏れて機能名が常時表示に
なっていた実例がある（Focus School/Railjack本体を実装した時とは別のタイミングで実装された
機能だったため、横展開されていなかった）。可視性の確認は`document.body.innerText`（実際に
画面に見えるテキストのみ）で走査するのが確実——生HTML全体だと`id`/`class`等の実装詳細に
機能名が含まれていてもノイズとして紛れ込み、見落としやすい。

## 「動く」で完了にしない

隔離環境での動作確認（クリックが効く、APIが期待通り返る等）はAIエージェント自身が担保できるが、
それは機能確認であって使用感の保証ではない。**新規UI・機能を実装した後は、それを最終形として
扱わず、実際に人間が触ってUXを確認するまでは未完了として扱う。** 実装内容を報告する時は
「動作確認は済んだが、実際に触った時の使用感は別途チェックしてほしい」という前提で伝えること。
少しでも操作の煩わしさ（クリック数、視認性、迷いやすさ等）を指摘されたら、機能の正誤ではなく
UXの微調整要望として素直に受け止め、改修する。

## コミット前チェックリスト

- [ ] `go build ./cmd/server` / `go vet ./...` / `gofmt -l .` / `go test ./...` が全てクリーン
- [ ] `git diff --stat`で`data/*.json`に意図しない変更が含まれていないか確認
- [ ] 新規セクションがメインストーリー進行に紐づく場合、ネタバレゲーティングが必要か検討した
- [ ] `pkg/engine/`・`pkg/model/`に触れる変更は、CODEOWNERSにより作者レビューが必須になる
