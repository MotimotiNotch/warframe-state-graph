<!--
Release 本文のテンプレート。release.yml の「Compose release notes」ステップが
%VERSION% をタグ名に、%CHANGES% を前タグからの feat/fix/perf コミット一覧に
差し替えて使う。

Release は説明書ではなく「最新版の配布ページ」として扱う方針なので、README を
丸ごとコピーせず、Download に一番早く辿り着ける長さに保つこと。詳しい説明は
README 側のリンクで済ませる。
-->
**Warframe State Graph %VERSION%** — Windows / インストール不要 / 無料

Warframeの「フレームを作りたい→レリックが足りない→そのレリックを狙うにはリソースが足りない」を辿っているうちに迷子になる問題を、依存関係グラフで追いかけるための個人用ツールです。

## ダウンロード

下の **Assets** から `warframe-state-graph-%VERSION%.zip` をダウンロード → 展開 → できた `WarframeStateGraph` フォルダの中の `warframe-state-graph.exe` をダブルクリック。

- インストール不要。記録は exe と同じフォルダの `data/` に保存されるので、消したい時はフォルダごと削除する。
- **アップデートは exe を上書きするだけ**。`data/` はそのまま引き継がれる。
- 初回起動が「アクセスが拒否されました」等で弾かれる場合は、README の該当項目を参照（未署名バイナリのため、セキュリティソフトが一時的にロックすることがある）。

## 今回の変更点

%CHANGES%

## 詳しい説明

使い方・画面ごとの機能・データの扱い・ネタバレへの配慮については [README](https://github.com/MotimotiNotch/warframe-state-graph#readme) を参照してください。

English: the app ships with a JA/EN toggle in the header. See [README.en.md](https://github.com/MotimotiNotch/warframe-state-graph/blob/main/README.en.md).
