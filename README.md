# Warframe State Graph

ゲーム内の依存関係グラフ（アイテム/MOD/シンジケート等）と自分の所持状態・目標を接続し、
放置しても「次の1手」を動的に再構成する個人用ツール。

Warframeには個人インベントリを取得できる公式APIが存在しないため、全自動同期は行わず、
登録したビルドに必要な数個のノードだけを手動でワンタップトグルする設計に割り切っている。

## 使い方（開発時）

```
go run ./cmd/server
```

`http://127.0.0.1:8787` にローカルWebサーバーが立ち上がり、既定のブラウザが自動で開く。

- **Chain View** (`/`): 依存関係グラフの表示・ドリルダウン・ワンタップトグル
- **Loadouts** (`/loadouts.html`): MODコンフィグ(A/B/C)・ビルドセットの管理
- **Collections** (`/collections.html`): Riven / Kuva・Tenet・Coda武器の入手ログ

**注意（2026-08-19〜）**: `web/` はビルド時にバイナリへ埋め込まれる（`webassets.go`）。
`go run ./cmd/server` はコマンド自体が毎回ソースから再ビルドするため、`html`/`js`を編集して
`go run`を再実行すれば最新の`web/`が反映されるが、**プロセスを起動したまま`web/`だけ編集して
ブラウザをリロードしても変更は反映されない**（以前の`http.Dir`直読み時代との違い）。必ず
`go run`を再実行すること。

## 配布用ビルド（非技術者への配布向け）

```
go build -o warframe-state-graph.exe ./cmd/server
```

`web/` の静的ファイルはこのビルドにバイナリごと埋め込まれるため（`webassets.go`）、
生成された `warframe-state-graph.exe` 1本だけを渡せば動く。渡す相手は好きな場所に置いて
ダブルクリックするだけでよい——`data/`（グラフ・Loadouts・Collectionsの保存先）はexeと
同じフォルダに実行時に自動生成される。フォルダごとコピーすればデータも一緒に移動する。

終了はコンソールウィンドウを閉じるだけ。

## 構成

- `pkg/model`: ノード/グラフの型定義（フラットなノード集合＋有向エッジ）
- `pkg/engine`: DAG探索・Next Action導出・requiresカスケード
- `pkg/persist`: 3つのFileStore共通の永続化基盤（アトミック書き込み・世代バックアップ・破損時の自動復旧）
- `pkg/store`: `data/graph.json` の永続化
- `pkg/loadout`: MODコンフィグ・ビルドセットの永続化
- `pkg/collection`: Riven / Kuva・Tenet・Coda武器の入手ログ永続化
- `pkg/wfcd`: WFCD公開データ（フレーム/武器/レリック等）の取得・キャッシュ
- `pkg/wfcdgen`: WFCDデータからノード候補を自動生成するロジック
- `cmd/server`: ローカルREST API + 静的ファイル配信（`web/`は常にバイナリへ埋め込み済み、開発時もビルドし直せば最新反映）
- `webassets.go`: `web/`をバイナリへ埋め込む`embed.FS`（モジュールルート直下に置く必要がある、詳細はファイル内コメント参照）

設計背景の詳細は `moti_base` Vault側の `Works/plans/WarframeStateGraph/` を参照
（このリポジトリは実装コードのみ、設計ドキュメントはVault側で管理）。

## ライセンス

MIT。ただし本ツールが参照するWFCDデータ・Warframe自体の権利表記は `LICENSE` 参照。
