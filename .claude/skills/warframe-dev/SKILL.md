---
name: warframe-dev
description: Warframe State Graphのコード変更・機能追加・バグ修正を行う際の開発ワークフロー。実データ(data/*.json)を壊さない隔離検証手順、既存モジュール構成に沿った新規データ種別の追加パターン、ネタバレゲーティングの実装パターン、コミット前チェックリストをカバーする。このリポジトリのソースを編集する・動作確認する・新機能を追加する時に使用する。
---

# Warframe State Graph 開発ワークフロー

TypeScript/Bun製のローカルWebアプリ（`ts/`配下、npmフレームワーク非依存）。`ts/web/`はコンパイル
時にバイナリへ埋め込まれる（`bun build --compile`、詳細は`ts/server/main.ts`冒頭コメント）。
旧Go版（`pkg/`/`cmd/`、リポジトリ直下）は2026-08-25で開発が止まった凍結済みの過去実装で、
現在は使わない。設計思想の詳細（なぜflat DAGか等）はこのリポジトリの外（作者のプライベート
Vault）で管理されているため、ここには実務的な手順のみを置く。README.mdとCONTRIBUTING.mdも
合わせて読むこと。

## ⚠️ 最優先: 実データ(`data/*.json`)を壊さない

`data/graph.json`/`loadouts.json`/`collections.json`/`standing.json`/`stats.json`/`glossary.json`/
`scratch.json`/`note.json`はリポジトリ作者の実際のプレイ進行データで、gitに追跡されている。
**動作確認のためだけに本番の`bun run dev`をリポジトリ直下で直接叩かない。**

TS版はGo版と違い、`DATA_DIR`環境変数でデータ保存先を明示的に切り替えられる仕組みが最初から
入っている（`ts/server/main.ts`）ので、隔離手順はGo版よりずっと単純——コード自体をコピーする
必要はなく、データ保存先だけ本物から逸らせばよい。

```bash
# 1. 検証用の空のデータディレクトリを用意（リポジトリ外、OSの一時ディレクトリ等）
SCRATCH=/path/to/scratch-data

# 2. DATA_DIRを指定してdevサーバーを起動——これだけで実データには一切触れない
cd ts
DATA_DIR="$SCRATCH" bun run dev
```

`bun run dev`はデフォルトで`ts/scratch-data/`を使う設計になっている（`DATA_DIR`未指定時、
`ts/server/main.ts`冒頭コメント参照）ため、素の`bun run dev`をそのまま実行するだけでも実データ
には触れない。上記の明示的な`DATA_DIR`指定は、特定の検証データセットを使い回したい場合や、
挙動を完全に把握しておきたい場合に使う。**いずれの場合も、ポートの上書きやコード全体のコピーは
不要**——Go版で必要だった「`cmd/server/main.go`のポート書き換え」「毎回のフルコピー」といった
手順はTS移行で丸ごと不要になった。

作業が終わったら、実際にコミットする前に本番リポジトリ側で `git diff --stat` を見て
`data/*.json`が変更されていないことを確認する。変更が必要な実データ操作（新フィールドの
既定値埋め込み等）は例外的にあり得るが、その場合は差分の中身を読んで意図した変更だけか
確認してからコミットする。

## ビルド・検証コマンド

```bash
cd ts
bun run typecheck   # prebuild-embed + tsc --noEmit
bun test            # 現状98件
bun run compile      # 配布用exeビルド（bun build --compile、DATA_DIR分岐・アイコン・
                      # コンソール非表示等の設定込み）
```

## 新しいデータ種別を追加するパターン

このリポジトリの各データ種別（Loadouts/Collections/Standing/Stats/Glossary/Scratch/Note）は
すべて同じ形の3点セットでできている。新規追加時はこれをそのまま模倣すればよい。

1. `ts/server/<name>.ts`: データ型（Zodスキーマ）+ `<Name>Store`クラス（`load`/`setXxx`/
   `upsertXxx`等、`persist.ts`の`loadJSON`/`saveJSON`を使う）
2. `ts/server/main.ts`: `const <name>Store = new <Name>Store(path.join(dataDir, "<name>.json"));`
   → `GET/POST/PUT/DELETE /api/<name>...`のルート登録
3. 必要ならフロント側（`ts/web/<name>.ts`/`.html`、新規ページの場合は`pages`配列・
   `scripts/prebuild-embed.ts`の`pageEntries`・各ページnavへの追加も忘れずに）

最も新しく単純な例は`ts/server/note.ts`（Noteページ用の単一Markdownドキュメント、2026-08-29
新設）。`ts/server/scratch.ts`（自由記述メモ＋カウンター）も参考になる。`ts/server/loadout.ts`は
複数エンティティ（Item/BuildSet）を持つ場合の参考になる。

## UIを追加・変更する時のデザイン原則

新規ページ・新規セクションを作る前に、まず既存ページ（`ts/web/standing.html`が一番素直な
参考例）の類似要素のCSSクラスをそのまま流用できないか確認する。ゼロから新しい見た目を作らない。

- **音量差**: 操作頻度の低い要素（凡例・補足説明）は常時表示せず、折りたたみ/ポップオーバー/
  アイコン化で格下げする。1画面の全要素を同じ強さで並べない。
- **生データでなく状態として見せる**: 属性は生テキストの羅列でなく、バッジ/アイコン/カラー
  コード（CSS変数 `--satisfied`/`--actionable`等）で表現する。
- **絵文字はUIアイコンとして使わない**: `ts/web/icons.ts`のLucideアイコンセットを使う。
- **全ページ共通のCSS変数を再定義しない**: `--panel`/`--accent`/`--border`等は各ページの
  `<style>`冒頭で同じ値を持っている。新しいトークンが必要な場合以外は既存のものを使う。

## ネタバレゲーティングパターン

新セクションが特定のメインストーリークエスト（`ts/server/questchain.ts`の`MainStoryChain`
参照）を前提とする機能なら、`ts/web/stats.ts`の`initCollapsiblePanel(prefix, questName,
revealedTitle)`と同じ仕組みを適用する——**機能の存在自体がネタバレになりうる**ため、前提クエスト
未クリアの間は`revealedTitle`を出さず「未解放セクション」というプレースホルダーのまま折りたたむ。

既存4実装（Focus School / Railjack本体 / Railjack Intrinsics / Drifter Intrinsics）が
`ts/web/stats.ts`内にリファレンスとしてある。同じファイルにこの機構自体の実装コメントもある。

このゲーティングは「機能名を含むh2/h3見出しテキスト」だけでなく、**同じページの他の場所
（ヘルプポップオーバーの説明文、他ページのnav案内文等）に同じ機能名が漏れていないか**も
セットで確認すること——過去に一度、Intrinsicsパネルだけこの保護が漏れて機能名が常時表示に
なっていた実例がある。可視性の確認は`document.body.innerText`（実際に画面に見えるテキスト
のみ）で走査するのが確実——生HTML全体だと`id`/`class`等の実装詳細に機能名が含まれていても
ノイズとして紛れ込み、見落としやすい。

## 「動く」で完了にしない

隔離環境での動作確認（クリックが効く、APIが期待通り返る等）はAIエージェント自身が担保できるが、
それは機能確認であって使用感の保証ではない。**新規UI・機能を実装した後は、それを最終形として
扱わず、実際に人間が触ってUXを確認するまでは未完了として扱う。** 実装内容を報告する時は
「動作確認は済んだが、実際に触った時の使用感は別途チェックしてほしい」という前提で伝えること。
少しでも操作の煩わしさ（クリック数、視認性、迷いやすさ等）を指摘されたら、機能の正誤ではなく
UXの微調整要望として素直に受け止め、改修する。

## コミット前チェックリスト

- [ ] `bun run typecheck` / `bun test`（`ts/`配下）が全てクリーン
- [ ] `git diff --stat`で`data/*.json`に意図しない変更が含まれていないか確認
- [ ] 新規セクションがメインストーリー進行に紐づく場合、ネタバレゲーティングが必要か検討した
- [ ] `ts/server/engine.ts`・`ts/server/model.ts`に触れる変更は、CODEOWNERSにより作者レビューが必須になる
