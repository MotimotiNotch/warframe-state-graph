# Warframe State Graph

🇯🇵 日本語 | [English](README.en.md)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/motimotinotch)

ゲーム内の依存関係グラフ（アイテム/MOD/シンジケート等）と自分の所持状態・目標を接続し、
放置しても「次の1手」を動的に再構成する個人用ツール。

Warframeには個人インベントリを取得できる公式APIが存在しないため、全自動同期は行わず、
登録したビルドに必要な数個のノードだけを手動でワンタップトグルする設計に割り切っている。

「フレームを作りたい→レリックが足りない→そのレリックを狙うにはリソースが足りない」と
依存関係を辿っているうちに「あれ、何をしてたんだっけ」と迷子になりがちなので、
その道しるべとして作った。

## 💛 投げ銭について

ゲームに関するデータ（WFCD等の公開データ取得）自体は無償。ただし**Chain View**は独自の思想
（フラットなDAGモデルでゲーム内の依存関係と自分の状態を接続し、次の一手を動的に導き出す設計）
のもとで作っているので、良いなと思ったら[Ko-fi](https://ko-fi.com/motimotinotch)で投げ銭して
もらえると嬉しい。保守（不具合対応等）は基本的にできる範囲で頑張って対応する。

Chain View以外のページ（Loadouts/Collections/Standing/Stats/Note）は「記録できたらいいな」
くらいの温度感で実装した補助的な機能という位置づけ。

## 🔒 通信・データについて

- **外部通信**: WFCD（`raw.githubusercontent.com/WFCD/...`、`api.warframestat.us`）およびcalamity-inc
  （`raw.githubusercontent.com/calamity-inc/...`、星図の総ノード数取得用、WFCDとは別の同種の公開Warframe
  データプロジェクト）から、アイテム/MOD/クエスト等のゲームデータを読み取り専用で取得するのみ。
  個人情報の送受信は行わない。
- **入力データの保存**: 達成状態・MOD構成・Riven記録・メモ等、入力した内容はすべてローカルの
  `data/*.json`に保存されるだけで、外部には一切送信されない。エラー発生時の診断用ログ
  （`<データ保存先>/logs/`）も同様にローカル保存のみ。
- 不具合・バグが発生した場合、原因調査のためこれらのJSONファイルの提出をお願いすることがある
  （その場合も、こちらから依頼した時のみ・任意提出）。
- **連絡先・バグ報告**: [X @motimotinotch](https://x.com/motimotinotch)

## ⚠️ ネタバレについての注意

このツールはWarframeの公開データ（WFCD）をそのまま扱うため、クエスト名・前提関係
（Chain ViewのWFCD自動生成によるQuestチェーン）やKuva/Tenet/Coda等のリッチ系武器名など、
**まだプレイしていないコンテンツの名称が画面に表示されることがある**。自分の進行に合わせて、
先の情報を見たくないページ（特にChain ViewのWFCD自動生成インポートウィザード）の利用は
控えることを推奨する。初回起動時（各ページ初回アクセス時）にも同内容の確認モーダルが出る
（`ts/web/spoiler-warning.ts`、`localStorage`で1回だけ表示）。

Statsページの一部セクションは、対応する前提クエストをクリアするまで機能名を伏せた
「未解放セクション」表示のまま折りたたまれる（`initCollapsiblePanel`、`revealedTitle`
引数）。前提クエストをクリア済みなら自動的に展開・実名表示に切り替わる。

ネタバレ対策には最大限注意を払っていますが、対応が難しいケースや漏れがある場合も
あります。あらかじめご了承ください。

## 使い方（開発時）

実装はTypeScript/Bun版（`ts/`配下）のみ。旧Go版（`pkg/`/`cmd/`）とレガシー`web/`ディレクトリは2026-08-30に完全削除済み。

```
cd ts
bun run dev
```

`http://127.0.0.1:8788` にローカルWebサーバーが立ち上がる（`--hot`でサーバー側の変更も自動反映、`web/*.ts`は毎リクエスト再ビルドなので保存するだけでブラウザ側リロードだけで最新反映される）。

- **Chain View** (`/`): 依存関係グラフの表示・ドリルダウン・ワンタップトグル・WFCD自動ノード生成（フレーム/武器/クエスト/シンジケート等）
- **Loadouts** (`/loadouts.html`): フレーム/武器/コンパニオンのMODコンフィグ(A/B/C、コンパニオンは単一構成)・ビルドセットの管理
- **Collections** (`/collections.html`): Riven / Kuva・Tenet・Coda武器の入手ログ、フレーム入手状況、デュビリ進捗
- **Standing** (`/standing.html`): 16シンジケート（6大シンジケート＋オープンワールド等10）の現在ランク・最高到達実績管理
- **Stats** (`/stats.html`): 星図/Steel Path進捗、Intrinsics、4データソース横断の読み取り専用集計（進行度に応じて解放される追加セクションもあり、詳細は下記「⚠️ ネタバレについての注意」参照）
- **Note** (`/note.html`): 1ページ丸ごとの永続Markdownメモ（定期的に見返す用）

全ページ共通のヘッダーウィジェット: ブースタータイマー、ライト/ダーク切替、壁紙/アイコン/ぼかし設定、用語マッピング編集、クイックメモ（どのデータにも紐づかない自由記述メモ＋手動カウンター、Noteページとは別物）、マニュアル（別ウィンドウで開くヘルプ）。

## 配布用ビルド（非技術者への配布向け）

非技術者に渡す場合は、自分でビルドする必要はない。**[Releases](../../releases)から最新の
`warframe-state-graph-vX.Y.Z.zip`をダウンロードするだけでよい**——タグをpushすると
GitHub Actionsが自動でビルドしてReleaseに添付する（`.github/workflows/release.yml`）。

自分でビルドする場合は:

```
cd ts
bun run compile
```

`ts/web/` の静的ファイルはこのビルドにバイナリごと埋め込まれるため、生成された
`ts/dist/warframe-state-graph.exe` 1本だけで動く。ただし**exeを裸のまま渡さず、専用フォルダに
入れてから渡す（またはzipで固める）こと**——`data/`（グラフ・Loadouts・Collectionsの保存先）は
exeと同じフォルダに実行時に自動生成されるため、Downloads/Desktopに単体のexeを置いたまま使うと、
後から素性不明のフォルダが隣に生えたように見えてしまう。Releaseのzipを展開してできる
`WarframeStateGraph/`フォルダのように、**exeとdata/が同じフォルダの中で完結する状態**を保つのが
安全——このフォルダごとコピー・バックアップすればデータも一緒に移動する。デスクトップに
置きたい場合は、フォルダの中のexeへの**ショートカット**を作ること（exe自体は動かさない）。

ダブルクリックすると、コンソールウィンドウ無しでURLバーの無いブラウザウィンドウ
（Microsoft Edgeの`--app`モード）が自動で開く。終了はそのウィンドウを閉じるだけ——
裏で動いているサーバー本体もウィンドウが閉じたタイミングで自動的に終了する。

### アップデートの仕方

新しいReleaseの`.exe`を、今使っているフォルダ内の`warframe-state-graph.exe`に上書きする
だけでよい。`data/`はexeの中身ではなく「exeが置かれているフォルダ」基準で読み書きされる
ため、`data/`には触れずexeファイルだけ差し替えればデータはそのまま引き継がれる（新フィールド
はZodスキーマの`.default()`で吸収されるため、既存データが読めなくなることは基本無い）。
心配なら上書き前に`data/`フォルダだけ手元にバックアップコピーしておくとより安全。

### ⚠️ 初回起動時に「アクセスが拒否されました」等で弾かれる場合

配布される `warframe-state-graph.exe` はコード署名なし（未署名バイナリ）。ビルド直後や
ダウンロード直後にセキュリティソフト（Windows Defender、Norton等）のリアルタイムスキャンが
ファイルを一時的にロック/検疫し、「アクセスが拒否されました」等のエラーで起動に失敗する
ことがある。数秒〜数十秒待ってから再度実行すると通常は解決する。改善しない場合は
セキュリティソフトの検疫履歴・通知を確認し、誤検知として復元/除外設定を行うこと。

コード署名証明書での恒久対応も検討したが、無名の個人配布ツールでは通常のOV証明書は
SmartScreenの警告解除に必要な「ダウンロード実績（レピュテーション）」が積み上がらず
効果が薄く、即時に警告を解除できるEV証明書は法人登記必須・高額なため見送り。

## 構成

現行実装は`ts/`配下（TypeScript/Bun）。`ts/server/`がバックエンド、`ts/web/`がフロントエンド。

- `server/model.ts`: ノード/グラフの型定義（フラットなノード集合＋有向エッジ、`requires`/`contains`の2種のみ）。ノードIDは8桁ランダム英数字（`generateRandomId()`）で、名前ベースの重複解決（`resolveNodeIds()`）を別途持つ
- `server/engine.ts`: DAG探索・Next Action導出・requiresカスケード（状態はノードに保存せず読み取り時に都度導出）
- `server/persist.ts`: 各Store共通の永続化基盤（アトミック書き込み・世代バックアップ・破損時の自動復旧）
- `server/store.ts`: `data/graph.json` の永続化、ノードの付け替え/独立させる機能（循環参照ガード付き）
- `server/loadout.ts`: MODコンフィグ・ビルドセットの永続化
- `server/collection.ts`: Riven / Kuva・Tenet・Coda武器の入手ログ永続化
- `server/standing.ts`: 16シンジケートの現在ランク・最高到達実績永続化
- `server/questchain.ts`: クエストの前提関係（Wiki由来の静的テーブル）
- `server/stats.ts`: 星図/Steel Path進捗・Intrinsicsおよび進行度に応じて解放される追加セクションの永続化、4データソース横断集計
- `server/starchart.ts`: 星図（惑星単位）の総ノード数集計
- `server/glossary.ts`: ゲーム内用語の英→日対応マッピング（編集可能な設定データ）
- `server/scratch.ts`: どのデータにも紐づかないクイックメモ（自由記述メモ＋手動カウンター）の永続化
- `server/note.ts`: Noteページ用の単一Markdownドキュメントの永続化
- `server/folder.ts`: Chain Viewサイドバーのフォルダ（目標の分類）永続化
- `server/wfcd.ts`: WFCD公開データ（フレーム/武器/レリック等）の取得・キャッシュ
- `server/wfcdgen.ts`: WFCDデータからノード候補を自動生成するロジック
- `server/dsl.ts`: テキストDSLからのノード一括生成パーサー
- `server/log.ts`: ファイルログ機構（`<dataDir>/logs/`、直近14日分保持）
- `server/main.ts`: ローカルREST API + 静的ファイル配信、コンパイル済みバイナリ実行時の自動設定（`DATA_DIR`判定、Edge自動起動等）

設計背景の詳細は `moti_base` Vault側の `Works/plans/WarframeStateGraph/` を参照
（このリポジトリは実装コードのみ、設計ドキュメントはVault側で管理）。

## 開発に参加する

コードを変更する場合は [CONTRIBUTING.md](CONTRIBUTING.md) を先に読んでほしい。特に
「実データ(`data/*.json`)について」の節は必読——このリポジトリはリポジトリ作者の実際の
プレイ進行データをgit管理下に置いており、ローカルで動かす前に隔離検証の手順を踏まないと
うっかり上書きしてしまう。Claude Code等のAIエージェントで作業する場合は
`.claude/skills/warframe-dev/SKILL.md` に同じ内容がより手順ベースでまとまっている。

## ライセンス

MIT。ただし本ツールが参照するWFCDデータ・Warframe自体の権利表記は `LICENSE` 参照。
