// "AI用の説明をコピー"ボタン用のテキスト（テキストから一括生成モーダル、
// 2026-08-29）。ChatGPT等の外部AIチャットにそのまま貼り付けて使う想定
// なので、内容はdocs/dsl-syntax.md（リポジトリルート）と同一に保つ——
// あちらが人間がリポジトリで読む正本、こちらはアプリ内コピー用の複製
// （manual.ts/06_Manual_Content_Draft.mdと同じ「コード側が正、外部の
// コピーは手動同期」という前例に倣う）。どちらかを直したらもう片方も
// 直すこと。
//
// 英語版（2026-08-30、i18n展開時に追加）は日本語版の翻訳であって別仕様
// ではない。日本語版を直したら英語版も同じ内容に揃えること。docs側は
// 日本語のまま（リポジトリの正本は1つ）。
import { effective } from "./locale.ts";

const DSL_AI_PROMPT_JA = `Warframe State Graph（個人用の依存グラフ完了トラッカー）の「テキストから一括生成」機能で読み込めるDSLの仕様です。

## 構文
- \`A -> B\` : 「Aの前提（requires）はB」。矢印は連鎖できる（\`A -> B -> C\`）。
- \`A -> [B -> C]\` : 「Aの中身（contains）にB」。角括弧の中でも\`->\`は同じ意味（requires）で、入れ子にもできる（\`[B -> [C]]\`）。
- \`,\` : 複数の式（チェーン）区切り。1回のテキストにいくつでも書ける。
- ノード名: 日本語・英語どちらも可。書いた文字列がそのままノードのidになる。

## 意味・ルール
1. 同じ名前は同一ノードに統合される（前提/中身は合算される）。既存のグラフに同名ノードが既にある場合は丸ごと上書きする（マージではない）。
2. 括弧は「直前のノード」の中身に繋がる。\`A -> [B -> C] -> D\`は「Aの中身にB」「BはCが前提」「AはDも前提」の意味（\`-> D\`はAから続く、Bの続きではない）。
3. 他のどこからも参照されない名前（チェーンの先頭）だけが探索起点になる。
4. 空の括弧\`[]\`や閉じ括弧の欠落はエラー。自己参照（\`A -> A\`）は無視される。
5. 「これを作るのに必要なパーツ・素材」は中身（contains, 角括弧）で表現する。パーツだけでなく素材（オキシウム、ニューラルセンサー等）も同じ扱い——「Aは複数の要素からできている」という関係は基本すべて\`A -> [要素]\`の形にする。前提（requires, \`->\`）は「これより先に完了しておくべき別の工程」（レリックを開封してからパーツを作る、等の順序がある関係）に使う。
6. 深くネストせず、フラットに書く。一度\`A -> [パーツ]\`でパーツをAの中身に登録したら、そのパーツ自身の中身・前提はパーツ名を直接使って\`パーツ -> [素材]\`のように書く（\`A -> [パーツ -> [素材]]\`と毎回Aから深くネストし直す必要はない——同じ名前は自動的に統合される）。ネストが深いほど閉じ括弧\`]\`の対応ミスが起きやすい。

## 例
単純な前提チェーン: \`Mag Prime入手 -> Neuroticsレリック開封 -> Neo N1レリック周回\`

パーツ構成: \`Mag Prime -> [設計図 -> Lithレリック開封], Mag Prime -> [シャーシ -> Mesoレリック開封]\`（「Mag Prime」は同一ノードに統合され、中身に両方まとまる）

パーツの素材も入れ子にする: \`ネウロプティカ -> レリック開封, ネウロプティカ -> [ニューラルセンサー], ネウロプティカ -> [オキシウム]\`（レリック開封は前提、素材は中身。ネウロプティカを毎回\`A -> [ネウロプティカ -> ...]\`と親から書き直さず、パーツ名を直接使ってフラットに）

同名ノードの共有: \`二番目の夢 -> Natah, 内なる紛争 -> 二番目の夢\`

---
上記の構文で、以下の内容を表すDSLテキストを1行で書いてください。説明は不要で、DSLのコードだけを出力してください。出力前に、開き括弧\`[\`と閉じ括弧\`]\`の数が一致しているか数えて確認してください。

作りたい内容: `;

const DSL_AI_PROMPT_EN = `This is the spec for the DSL accepted by the "bulk-create from text" feature of Warframe State Graph (a personal dependency-graph completion tracker).

## Syntax
- \`A -> B\` : "A requires B". Arrows can be chained (\`A -> B -> C\`).
- \`A -> [B -> C]\` : "A contains B". Inside the brackets \`->\` still means requires, and brackets can nest (\`[B -> [C]]\`).
- \`,\` : separates multiple expressions (chains). Write as many as you like in one text.
- Node names: Japanese or English. Whatever string you write becomes the node's id.

## Meaning and rules
1. Identical names are merged into one node (their requires/contains are combined). If a node with the same name already exists in the graph, it is overwritten wholesale (not merged).
2. Brackets attach to the *immediately preceding* node's contents. \`A -> [B -> C] -> D\` means "A contains B", "B requires C", and "A also requires D" (the \`-> D\` continues from A, not from B).
3. Only names never referenced from anywhere else (the head of a chain) become entry points.
4. Empty brackets \`[]\` and missing closing brackets are errors. Self-references (\`A -> A\`) are ignored.
5. Express "the parts and materials needed to make this" as contents (contains, square brackets). Materials (Oxium, Neural Sensors, etc.) are treated the same way as parts — any "A is made of several elements" relation should be written as \`A -> [element]\`. Use requires (\`->\`) for "a separate step that must be finished before this one" (ordered relations, such as cracking a relic before building a part).
6. Write it flat, not deeply nested. Once you've registered a part inside A with \`A -> [part]\`, write that part's own contents/prerequisites using the part's name directly, as \`part -> [material]\` (there's no need to re-nest from A each time as \`A -> [part -> [material]]\` — identical names are merged automatically). The deeper the nesting, the easier it is to mismatch a closing \`]\`.

## Examples
A simple prerequisite chain: \`Get Mag Prime -> Crack the Neuroptics relic -> Farm Neo N1 relics\`

Part composition: \`Mag Prime -> [Blueprint -> Crack a Lith relic], Mag Prime -> [Chassis -> Crack a Meso relic]\` ("Mag Prime" is merged into one node, with both under its contents)

Nesting a part's materials too: \`Neuroptics -> Crack a relic, Neuroptics -> [Neural Sensor], Neuroptics -> [Oxium]\` (cracking the relic is a prerequisite, the materials are contents. Rather than rewriting Neuroptics from its parent each time as \`A -> [Neuroptics -> ...]\`, use the part's name directly and keep it flat)

Sharing a node by name: \`The Second Dream -> Natah, The War Within -> The Second Dream\`

---
Using the syntax above, write a single-line DSL text expressing the content below. No explanation is needed — output only the DSL code. Before you output it, count the opening \`[\` and closing \`]\` brackets to confirm they match.

What I want to build: `;

/** The AI-prompt text in the current display language. Was a plain exported
 * constant before the i18n rollout. */
export function dslAiPrompt(): string {
  return effective() === "en" ? DSL_AI_PROMPT_EN : DSL_AI_PROMPT_JA;
}
