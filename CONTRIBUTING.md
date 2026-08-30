# Contributing

このリポジトリへの変更を検討してくれてありがとう。個人用ツールとして育ってきた経緯があるため、
一般的なOSSより前提知識が要る部分がある。ここではその前提を埋める。

## 開発環境

実装は`ts/`配下のみ（TypeScript、[Bun](https://bun.sh/)ランタイム）。npmフレームワークは使って
いない。旧Go版（`pkg/`/`cmd/`）とレガシー`web/`ディレクトリは2026-08-30に完全削除済み。

```
cd ts
bun install
bun run dev
```

`http://127.0.0.1:8788` にサーバーが立ち上がる。`--hot`でサーバー側（`server/`）の変更も
自動反映され、フロント側（`web/*.ts`）は毎リクエスト再ビルドするため、保存してブラウザを
リロードするだけで最新の内容が反映される。

## ⚠️ 実データについて（最初に必ず読んでほしい）

`data/*.json`（`graph.json`/`loadouts.json`/`collections.json`/`standing.json`/`stats.json`/
`glossary.json`/`scratch.json`/`note.json`）はリポジトリ作者本人の実際のプレイ進行データで、
**gitで追跡されている**。リポジトリ直下で`bun run dev`をそのまま実行すると、動作確認の
クリックがこのファイルを直接書き換える。

`DATA_DIR`環境変数でデータ保存先を切り替えられるため、隔離手順は単純——コード自体を
コピーする必要はない:

```bash
cd ts
DATA_DIR=/path/to/scratch-data bun run dev
```

（`bun run dev`は`DATA_DIR`未指定時もデフォルトで`ts/scratch-data/`を使う設計になっている
ため、素の`bun run dev`をそのまま実行するだけでも実データには触れない。上記は特定の検証
データセットを使い回したい場合向け。）

PRの差分に `data/*.json` の変更が紛れ込んでいないか、`git diff` で必ず確認してから提出してほしい。
新しいノード種別やフィールドを試すためのサンプルデータが必要な場合は、PRの説明にその旨を書いて
テストデータであることを明示するか、`*.test.ts` 内のフィクスチャとして持たせてほしい。

## コーディング規約・設計原則

- **flat DAGモデル**: `ts/server/model.ts`の`Node`型はフラットなノード集合＋有向エッジ
  （`requires`/`contains`）で完結させる。`contains` はUI上のグループ化表現に限定し、達成状態
  （`satisfied`）の意味論には一切関与しない（`requires` のみが「前提が終わっていること」を意味
  する）。状態（SATISFIED/ACTIONABLE/BLOCKED）はノードに保存せず、`ts/server/engine.ts`が
  読み取り時に都度導出する。
- **各データ種別は独立したStore**: `ts/server/loadout.ts`/`collection.ts`/`standing.ts`/
  `stats.ts`/`glossary.ts`/`scratch.ts`/`note.ts` はいずれも`ts/server/persist.ts`共通の
  単一JSONファイル永続化パターン（アトミック書き込み・世代バックアップ）を使う。新しいデータ
  種別を追加するときはこのどれか（最も単純なのは`note.ts`）をテンプレートにするのが早い。
- **Web UIはVanilla TypeScript + HTML/CSS**: フレームワーク・仮想DOM無し。絵文字はUIアイコンと
  して使わない（Lucideアイコン、`ts/web/icons.ts`）。テーマ（ライト/ダーク）はCSS変数
  （`--panel`/`--accent`等）で切り替わる設計なので、色は決め打ちせず変数を使うこと。
- **全ページ共通ウィジェットは自己完結モジュール**: `ts/web/booster.ts`/`scratch.ts`等、複数
  ページで使う機能は単一のTSモジュールとして実装し、各ページの entry ts（`index.ts`等）から
  `import "./booster.ts";`のように副作用インポートするだけで動くようにする（`icons.ts` の
  `getTopRightBar()` で右上共有バーへボタンを追加する等）。
- **情報に音量差をつける**: 操作頻度の低い要素（凡例、補足説明文等）は常時全文表示せず、
  折りたたみ・ポップオーバー・アイコン化で格下げする。1画面の全要素を同じ強さで並べない
  ——主役（グラフ本体、選択中の詳細パネル等）に視線が集まるよう、周辺のヘッダー・操作領域は
  面積を最小化する方向で作る。
- **他要素の上に浮くUI（`.popover`/`.modal`/`.suggest-list`/`.flyout`等）は基本的に透過しない**:
  背景パネル（`--panel`）は壁紙を透かす狙いで半透明だが、これらは他要素の上に浮かぶ読み物
  なので専用の`--popover-bg`（ダーク`rgba(20, 22, 28, 0.94)`/ライト
  `rgba(255, 255, 255, 0.96)`、ほぼ不透明）を使うこと。`--panel`をそのまま流用すると
  背後の要素が透けて読みにくくなる。新規に`position: absolute`/`fixed`で他コンテンツに
  重なる要素を作るときは毎回このルールを確認する（クラス名ごとに個別対応すると漏れる）。
- **`favorite`フィールドを持つカード一覧はお気に入りを先頭（左上）にソートする**: 名前の
  alphabeticalソートだけで終わらせず、`(b.favorite - a.favorite) || 通常の比較`のように
  favoriteを第一キーにする。Riven/Kuvaグループ/Loadout Itemsで統一済み（2026-08-23）。
- **生データではなく状態として見せる**: 日本語名/英語名/ID/種別タグのような属性は、生の
  テキストラベルを並べるのではなく、バッジ・アイコン・カラーコードで「一目で状態がわかる」
  表現に変換する。操作に不要な生ID等はツールチップへ格下げするか非表示にする。
- **カード上の状態表示（`.status-icon`）は緑=on/灰=offの2値のみで、複数指標が並ぶ場合は
  アイコン種別でカテゴリを区別する**: 9px程度のドットは色相だけでは複数並んだ時に判別
  できない（「全部緑だと分からん」「並ぶとコントラストがない」の2回の指摘、2026-08-23）ため、
  形（Lucideアイコン）で区別しon/offの色は共通ルールとする。パネル見出しの凡例は
  カテゴリごとにonのアイコン1個だけを示せば足りる（緑=達成/灰=未達成は自明なため、
  on/off両方を毎回ペア表示すると冗長——1個だけのRiven/Kuvaもこの形式に統一済み）。
- **全ページを1つのデザインシステムとして統一する**: カラーパレット・余白感・タイポグラフィ・
  カードコンポーネントは全ページで共有し、どのページを開いても「同じ道具の別画面」だと
  感じられる一貫性を保つ。新規ページ・新規セクションを追加する時は、まず既存ページの類似要素
  （カード、パネル、モーダル等）のCSSクラスをそのまま流用できないか確認すること。

## ネタバレ配慮が要る変更

このアプリはWarframeのゲームデータをそのまま扱うため、機能によっては「その機能が存在すること
自体」が未プレイのプレイヤーへのネタバレになる（例: Focus School/Railjack関連機能は、それらが
アンロックされる大きなストーリー展開の前提クエストをクリアするまで、機能名自体を隠す設計に
なっている）。

新しいセクションを追加する際、それが特定のメインストーリークエスト（`ts/server/questchain.ts`の
`MainStoryChain`を参照）を前提とする機能なら、`ts/web/stats.ts` の `initCollapsiblePanel()` と
同じパターン（前提クエスト未クリアの間は機能名を伏せて折りたたむ）を適用してほしい。既存の4実装
（Focus School / Railjack本体 / Railjack Intrinsics / Drifter Intrinsics）がリファレンスになる。

## テスト・ビルド確認

PRを出す前に以下を通しておくこと（CIでも同じチェックが走る）。

```bash
cd ts
bun run typecheck
bun test
```

## コードオーナー

`ts/server/engine.ts`（DAG探索・Next Action導出）と `ts/server/model.ts`（flat DAGの型定義）は
このプロジェクトの核となる設計判断が詰まっている領域のため、`.github/CODEOWNERS` で作者の
レビューを必須にしている。他の領域は通常のPRフローで問題ない。

## ブランチ戦略

[GitHub Flow](https://docs.github.com/ja/get-started/using-github/github-flow)。`main`が常に
デプロイ可能なトレンク、develop/releaseのような常設ブランチは無い。

- 外部からの変更は、フォーク→トピックブランチ→`main`へのPRで送ってほしい。CI（typecheck/test）
  が通ることが前提、`ts/server/engine.ts`/`model.ts`に触れる場合はCODEOWNERSにより作者の
  レビューが必須になる。
- リリースは`main`上のタグ（`vX.Y.Z`）push契機で自動化されている（`.github/workflows/release.yml`）。

## PR

- UIに関わる変更は、ビルドが通ることの確認だけでなく、実際にブラウザで触ってから出してほしい。
  「動く」ことと「使っていて煩わしくない」ことは別軸——少しでも操作に迷いや引っかかりを感じたら、
  出す前に見直す余地がある。
- 1つのPRは1つの変更にまとめる（機能追加とリファクタを混ぜない）。
- コミットメッセージは [Conventional Commits](https://www.conventionalcommits.org/)
  （`feat(scope): ...` / `fix(scope): ...` / `docs: ...` 等）に沿っていると読みやすい。
- 設計判断の背景を聞きたい場合はIssueで気軽に質問してほしい。
