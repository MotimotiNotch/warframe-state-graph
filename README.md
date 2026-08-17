# Warframe State Graph

ゲーム内の依存関係グラフ（アイテム/MOD/シンジケート等）と自分の所持状態・目標を接続し、
放置しても「次の1手」を動的に再構成する個人用ツール。

Warframeには個人インベントリを取得できる公式APIが存在しないため、全自動同期は行わず、
登録したビルドに必要な数個のノードだけを手動でワンタップトグルする設計に割り切っている。

## 使い方

```
go run ./cmd/server
```

`http://127.0.0.1:8787` にローカルWebサーバーが立ち上がる。

- **Chain View** (`/`): 依存関係グラフの表示・ドリルダウン・ワンタップトグル
- **Loadouts** (`/loadouts.html`): MODコンフィグ(A/B/C)・ビルドセットの管理

## 構成

- `pkg/model`: ノード/グラフの型定義（フラットなノード集合＋有向エッジ）
- `pkg/engine`: DAG探索・Next Action導出・requiresカスケード
- `pkg/store`: `data/graph.json` の永続化
- `pkg/loadout`: MODコンフィグ・ビルドセットの永続化
- `pkg/wfcd`: WFCD公開データ（フレーム/武器/レリック等）の取得・キャッシュ
- `pkg/wfcdgen`: WFCDデータからノード候補を自動生成するロジック
- `cmd/server`: ローカルREST API + 静的ファイル配信

設計背景の詳細は `moti_base` Vault側の `Works/plans/WarframeStateGraph/` を参照
（このリポジトリは実装コードのみ、設計ドキュメントはVault側で管理）。

## ライセンス

MIT。ただし本ツールが参照するWFCDデータ・Warframe自体の権利表記は `LICENSE` 参照。
