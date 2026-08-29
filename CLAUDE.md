# Claude Code — このリポジトリでの前提

Warframeの依存関係グラフ管理ツール。個人開発から始まったリポジトリで、他のOSSより前提知識が
要る部分がある。作業前に必ず以下を確認すること。

## ⚠️ 最優先で確認すること: 実データ

`data/*.json` はリポジトリ作者本人の実際のプレイ進行データで、**gitで追跡されている**。
リポジトリ直下で迂闊に `bun run dev` を実行し画面を操作すると、このファイルを直接書き換えて
しまう。作業前に必ず [CONTRIBUTING.md](CONTRIBUTING.md) の「⚠️ 実データについて」を読み、
`DATA_DIR` 環境変数での隔離手順（`ts/`配下では `bun run dev` がデフォルトで
`ts/scratch-data/` を使う設計なので、素の `bun run dev` なら実データには触れない）を踏むこと。
PRを出す前は `git diff` で `data/*.json` が紛れ込んでいないか必ず確認する。

## 現行実装は `ts/` 配下のみ

TypeScript + [Bun](https://bun.sh/)。リポジトリ直下の `pkg/`/`cmd/`（Go実装）は2026-08-25で
開発が止まった凍結済みの過去実装で、**現在は変更しない**——`ts/`側の完全な後継が動いている。
どちらか判断に迷ったら`ts/`側が正。

```
cd ts
bun install
bun run dev
```

`http://127.0.0.1:8788`。`--hot`でサーバー側（`server/`）は自動反映、フロント側（`web/*.ts`）は
毎リクエスト再ビルドなので保存してブラウザをリロードするだけで最新化される。

## 参照先（詳しい順に）

- [`.claude/skills/warframe-dev/SKILL.md`](.claude/skills/warframe-dev/SKILL.md): 開発ワークフローの
  詳細（隔離検証手順、新データ種別の追加パターン、UIデザイン原則、ネタバレ配慮パターン、コミット
  チェックリスト）。AIエージェントとして作業するならここが一番手順ベースでまとまっている。
- [`CONTRIBUTING.md`](CONTRIBUTING.md): 人間のコントリビューター向け。コーディング規約・設計原則
  （flat DAGモデル、Store設計、UIの音量差等）、ブランチ戦略（GitHub Flow）、PR時の確認事項。
- [`README.md`](README.md): プロジェクト概要・機能一覧・配布ビルドの作り方。

## 特に踏み外しやすい点

- **`ts/server/engine.ts`と`ts/server/model.ts`はCODEOWNERS必須**（DAG探索とflatモデルの核）。
  この2ファイルに触れる変更は作者レビュー前提で進める。
- **ネタバレ配慮**: ゲームデータをそのまま扱うため、機能名自体がネタバレになる場合がある
  （`ts/server/questchain.ts`の`MainStoryChain`、`ts/web/stats.ts`の`initCollapsiblePanel()`
  パターン）。新セクション追加時は既存4実装（Focus School/Railjack本体/Railjack Intrinsics/
  Drifter Intrinsics）を参照。
- **絵文字をUIアイコンとして使わない**（Lucideアイコン、`ts/web/icons.ts`を使う）。
- コミットメッセージは [Conventional Commits](https://www.conventionalcommits.org/)。
- リリースは`main`上の`vX.Y.Z`タグpushで自動化（`.github/workflows/release.yml`）——手動でexeを
  作ってアップロードする必要は無い。
