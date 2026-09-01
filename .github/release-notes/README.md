# Release ノート（手書き）

`vX.Y.Z.md` を置いておくと、そのタグの Release 本文の「今回の変更点」節にそのまま差し込まれる
（`.github/workflows/release.yml` の Compose release notes ステップ）。中身は Markdown の
箇条書きだけでよく、見出しは付けない。

```markdown
- 追加: シンジケートに Cavia / The Hex を追加
- 修正: ネクロロイドの表記を訂正
```

置かなかった場合は、前タグからの `feat`/`fix`/`perf` コミット件名から自動生成される。
コミット件名は開発者向けの英文なので、利用者に読ませる一覧としては手書きの方が望ましい。
