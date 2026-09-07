// Entry script for the standalone manual.html window (opened by
// manual-launcher.ts via window.open). Reads the calling page's DOM through
// window.opener (same-origin) to highlight the button a topic is about, so
// のっち can keep both windows visible side by side while reading.
import "./theme.ts";
import { flashHighlight } from "./highlight.ts";
import { applyI18nText, effective as locale, onLocaleChange, type Locale } from "./locale.ts";

/** A string that exists in both display languages. The manual is prose, not
 * chrome, so each topic carries its two versions side by side rather than
 * living in a separate STRINGS table — keeping them adjacent is what stops
 * the translations drifting apart as topics get edited. */
type Text = Record<Locale, string>;

function tx(text: Text): string {
  return text[locale()];
}

interface ManualTopic {
  id: string;
  title: Text;
  body: Text;
  /** DOM id, in the opener document, this topic is about. Omitted for a
   * page-wide behavior with no single anchor element to highlight. */
  targetId?: string;
  /** TOC/content section heading rendered directly above this topic.
   * 2026-08-27: page-specific topics and the always-present top-right-bar
   * menu items were interleaved in one flat list with no visual grouping,
   * making it unclear the menu items are the same shared widget on every
   * page (のっち指摘). Set only on the first topic of each group — render()
   * inserts the heading whenever it differs from the previous topic's. */
  section?: Text;
}

const SECTION_PAGES: Text = { ja: "ページ", en: "Pages" };
const SECTION_GRAPH: Text = { ja: "Chain View — グラフ操作", en: "Chain View — working with the graph" };
const SECTION_INSPECTOR: Text = { ja: "Chain View — 詳細パネル", en: "Chain View — the detail panel" };
const SECTION_SIDEBAR: Text = { ja: "Chain View — 目標一覧", en: "Chain View — the goal list" };
const SECTION_CROSS: Text = { ja: "横断的な機能", en: "Cross-page features" };
const SECTION_MENU: Text = { ja: "メニュー", en: "Menu" };
const SECTION_OTHER: Text = { ja: "その他", en: "Other" };

// 2026-08-27: covers the always-visible shared widgets (top-right-bar icons)
// plus a couple of easy-to-miss cross-page behaviors. Deliberately excludes
// the header-icon/wallpaper picker (bindHeaderIconEasterEgg in wallpaper.ts)
// — that's an intentional undocumented easter egg (click the page's own
// logo), not something a manual should spell out.
const MANUAL_TOPICS: ManualTopic[] = [
  {
    id: "page-chainview",
    title: { ja: "Chain View", en: "Chain View" },
    section: SECTION_PAGES,
    body: {
      ja: "<p>ゲーム内の依存関係グラフと自分の進行状況を接続し、次にやるべきことを動的に導き出すメインページです。ノードの状態については「凡例」を参照してください。</p>",
      en: "<p>The main page: it connects the in-game dependency graph to your own progress and works out what you can do next. See “Legend” for what each node state means.</p>",
    },
  },
  {
    id: "page-loadouts",
    title: { ja: "Loadouts", en: "Loadouts" },
    body: {
      ja: `<p>フレーム/武器ごとのMODコンフィグ（A/B/C）とビルドセットの管理ページです。</p>
      <ul>
        <li>Itemsは種別（Frame/Weapon/Companion/Archwing/Necramech）ごとにサブセクション分けされています</li>
        <li>星マーク（★）は「今のビルドで使ってる/優先度高い」という主観マーカーで、お気に入りが各セクションの先頭に並びます（並び順は起動時点で固定され、編集中に急に順番が変わることはありません）</li>
        <li>各セクションは右上のアイコンで開閉でき、状態は次回起動時も引き継がれます</li>
        <li>名前で絞り込み検索ができます。8件を超える分は「もっと見る」で表示／折りたたみを切り替えられます</li>
        <li>見出し横の＋アイコンから新規登録できます</li>
        <li>Chain Viewと連携済みのアイテムには、カード内に進捗のミニグラフが表示されます（色の意味はItems見出し横の凡例を参照。点にカーソルを合わせると内訳が出ます）</li>
      </ul>
      <p class="caution">⚠️ フレーム/武器名やビルド名など、未プレイのコンテンツ名が表示されることがあります。</p>`,
      en: `<p>Manages per-frame / per-weapon mod configs (A/B/C) and build sets.</p>
      <ul>
        <li>Items are split into subsections by kind (Frame/Weapon/Companion/Archwing/Necramech)</li>
        <li>The star (★) is a subjective marker for “using this in my current build / high priority”, and favourites sort to the front of each section (the order is fixed when the page loads, so nothing jumps around while you edit)</li>
        <li>Each section collapses from the icon at its top right, and that state carries over to your next launch</li>
        <li>You can filter by name. Anything past the first 8 entries is shown or hidden with “Show more”</li>
        <li>The + icon next to a heading registers a new entry</li>
        <li>Items linked to Chain View show a progress mini-graph on their card (see the legend next to the Items heading for what the colours mean; hover a dot for the breakdown)</li>
      </ul>
      <p class="caution">⚠️ Frame/weapon names and build names may reveal content you have not played yet.</p>`,
    },
  },
  {
    id: "page-collections",
    title: { ja: "Collections", en: "Collections" },
    body: {
      ja: `<p>Chain View / Loadoutsとは独立した、フレーム/Riven/Kuvaの入手状況ログです。</p>
      <ul>
        <li>緑のアイコンは「達成済み」、灰色は「未達成」。1枚に複数の指標がある場合はアイコンの形でカテゴリを区別しています</li>
        <li>星マーク（★）は「今のビルドで使ってる/優先度高い」という主観マーカーで、状態アイコンとは独立して立てられます。お気に入りが先頭に並びます</li>
      </ul>
      <p class="caution">⚠️ 一部のセクションは前提クエストクリア後にのみ内容が明らかになります。</p>`,
      en: `<p>A log of which frames / Rivens / Kuva weapons you own, independent of Chain View and Loadouts.</p>
      <ul>
        <li>A green icon means “done”, grey means “not yet”. Where one card tracks several things, the icon shape tells the categories apart</li>
        <li>The star (★) is a subjective “using this / high priority” marker, set independently of the state icon. Favourites sort to the front</li>
      </ul>
      <p class="caution">⚠️ Some sections only reveal their contents once the prerequisite quest is cleared.</p>`,
    },
  },
  {
    id: "page-standing",
    title: { ja: "Standing", en: "Standing" },
    body: {
      ja: `<p>全18シンジケート（Conclave/Cephalon Simarisを除く）の現在ランクを記録する場所です。</p>
      <ul>
        <li>6大シンジケート（Steel Meridian/Arbiters of Hexis/Cephalon Suda ⇔ Red Veil/The Perrin Sequence/New Loka）は2陣営が敵対関係にあり、片方を上げるともう片方が下がりうる（0を割ると降格し最大Rank -2まで下降）。そのためChain Viewの<code>requires</code>連鎖トグルとは別に、現在ランクの値そのものを直接保持・更新します</li>
        <li>他の12シンジケートは敵対関係を持たず、ランクは0以上のみ</li>
        <li>貢献アイテムの中身は一部シンジケートで実データからの解釈が確定できず「不明」表示のままのものがあります</li>
        <li>武器購入に必要な特定ランクの管理はChain View側のノード生成（WFCD自動生成のシンジケート候補）を使ってください</li>
      </ul>
      <p class="caution">⚠️ シンジケート武器名など、未プレイのコンテンツ名が表示されることがあります。</p>`,
      en: `<p>Where you record your current rank with all 18 syndicates (Conclave and Cephalon Simaris aside).</p>
      <ul>
        <li>The six main syndicates (Steel Meridian/Arbiters of Hexis/Cephalon Suda ⇔ Red Veil/The Perrin Sequence/New Loka) are two opposed camps, so raising one can lower the other (dropping below 0 demotes you, down to Rank -2). That is why this page stores and updates the rank value itself, rather than using Chain View's <code>requires</code> cascade</li>
        <li>The other 12 syndicates have no opposition and only go from 0 upwards</li>
        <li>For a few syndicates the offering contents can't be pinned down from the source data, and stay shown as “unknown”</li>
        <li>To track the specific rank a weapon purchase needs, generate nodes on the Chain View side instead (the WFCD wizard's syndicate suggestions)</li>
      </ul>
      <p class="caution">⚠️ Syndicate weapon names may reveal content you have not played yet.</p>`,
    },
  },
  {
    id: "page-stats",
    title: { ja: "Stats", en: "Stats" },
    body: {
      ja: `<p>上段は既存4データソース（Chain View/Loadouts/Collections/Standing）の読み取り専用集計です。</p>
      <ul>
        <li>「クエスト進行状況」パネルでクリア済みのクエストにチェックを入れると、対応する下段の追加セクションの折りたたみが解除されます</li>
        <li>星図/鋼の道のり/性能値（Intrinsics）は、惑星・地域単位の粗い進捗（ノード個別トグルは持たない）を記録する数値入力欄です</li>
        <li>すべてのパネルは右上のアイコンで開閉でき、状態は次回起動時も引き継がれます</li>
      </ul>
      <p class="caution">⚠️ 惑星名などにネタバレを含むことがあります。対応するクエストをクリア済みでないセクションは、内容を明かさないよう折りたたんだままにしています。</p>`,
      en: `<p>The upper half is a read-only roll-up of the four existing data sources (Chain View / Loadouts / Collections / Standing).</p>
      <ul>
        <li>Ticking a cleared quest in the “Quest progress” panel unlocks the matching extra section further down</li>
        <li>Star Chart / Steel Path / Intrinsics are number fields for coarse progress by planet or region — there are no per-node toggles</li>
        <li>Every panel collapses from the icon at its top right, and that state carries over to your next launch</li>
      </ul>
      <p class="caution">⚠️ Planet names and the like can be spoilers. Sections whose quest you have not cleared stay collapsed so they don't give anything away.</p>`,
    },
  },
  {
    id: "page-note",
    title: { ja: "Note", en: "Note" },
    body: {
      ja: "<p>1ページだけの大きなMarkdownメモです。ヘッダーの「クイックメモ」（小さな付箋、常時どのページからも開ける）とは別物で、こちらは定期的に見返す用の場所という位置づけです。書いた内容はそのまま自動保存されます。</p>",
      en: "<p>One big single-page Markdown note. Not the same thing as “Quick Memo” in the header (the small sticky note you can open from any page) — this one is meant for things you come back to. What you type is saved automatically.</p>",
    },
  },
  {
    id: "wfcd-refresh",
    title: { ja: "WFCDデータ更新", en: "Refreshing the WFCD data" },
    section: SECTION_GRAPH,
    body: {
      ja: "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください。",
      en: "Press this when a game update has added new frames or weapons and they aren't showing up as suggestions yet.",
    },
    targetId: "refresh-wfcd-btn",
  },
  {
    id: "wfcd-asof",
    title: { ja: "WFCDデータの取得日時", en: "When the WFCD data was fetched" },
    section: SECTION_GRAPH,
    body: {
      ja: `<p>更新ボタンの左にある「WFCD ○○」は、外部データをいつ取得したかの表示です（データはファイル単位で取り込まれるため、もっとも古いものの日付を出しています）。</p>
      <p>これが必要なのは、レリックのVault判定が「ドロップ表に載っていないこと」を根拠にしているからです。データが古いと、実際には入手できるレリックがVault済と表示される——つまり「情報が無い」ではなく「間違った答え」になります。古ければ隣の更新ボタンで全部取り直せます。</p>`,
      en: `<p>The “WFCD ○○” to the left of the refresh button is when the external data was fetched (it comes in file by file, so the date shown is the oldest one).</p>
      <p>This matters because a relic is judged vaulted on the grounds that it is <em>absent</em> from the drop tables. Stale data therefore marks an obtainable relic as vaulted — a wrong answer, not a missing one. If the date looks old, the refresh button next to it re-fetches everything.</p>`,
    },
    targetId: "wfcd-asof",
  },
  {
    id: "update-follow-up",
    title: { ja: "アップデートへの追従について", en: "Keeping up with game updates" },
    body: {
      ja: `<p>ゲームアップデートへの追従は、対応の仕方が2段階に分かれます。</p>
      <ul>
        <li><b>更新ボタンで自動的に反映されるもの</b>: フレーム/武器/MOD/レリック名の候補、Kuva/Tenet/Coda等の判定、シンジケート武器のランク逆引き、日本語名など、外部データを都度取り直す仕組みの範囲</li>
        <li><b>コード側の修正が必要なもの</b>: クエストの前提関係、シンジケートのランク名・陣営構成、Steel Path対象外の惑星リストなど、Wikiの内容を元にした固定表で持っている情報。ゲームアップデートで変更があっても更新ボタンでは反映されません</li>
      </ul>
      <p>新しいエリアや進行システムがまるごと追加されるような大型アップデートは、そもそも新規の設計・実装が必要になります。</p>`,
      en: `<p>Keeping up with a game update happens at two different levels.</p>
      <ul>
        <li><b>Handled by the refresh button</b>: anything that comes from re-fetching the external data — frame/weapon/mod/relic name suggestions, Kuva/Tenet/Coda classification, the rank a syndicate weapon needs, Japanese names</li>
        <li><b>Needs a code change</b>: anything held in a fixed table built from the wiki — quest prerequisites, syndicate rank names and camp structure, the list of planets outside Steel Path. The refresh button will not pick these up when a game update changes them</li>
      </ul>
      <p>A big update that adds a whole new area or progression system needs new design and implementation regardless.</p>`,
    },
  },
  {
    id: "legend",
    title: { ja: "凡例", en: "Legend" },
    body: {
      ja: "ノードの色・アイコンが何を表しているかを確認できます。",
      en: "Shows what each node colour and icon means.",
    },
    targetId: "legend-toggle",
  },
  {
    id: "compact-toggle",
    title: { ja: "コンパクト表示", en: "Compact view" },
    body: {
      ja: "グラフ本体をより狭いスペースで表示します。ウィンドウ幅が狭い時は自動でも切り替わります。",
      en: "Fits the graph itself into less space. It also switches on by itself when the window is narrow.",
    },
    targetId: "compact-toggle",
  },
  {
    id: "requires-contains-editing",
    title: { ja: "前提・中身を編集する3つの方法", en: "Three ways to edit prerequisites and contents" },
    body: {
      ja: `<p>ノード同士の前提（requires）・中身（contains）の関係を作る方法は3つあり、用途が異なります。</p>
      <ul>
        <li><b>Inspectorの「前提を追加」「中身を追加」</b>: 選択中のノードの子として、新規ノードを1個作ってその場で繋ぐショートカットです。</li>
        <li><b>付け替え</b>: 既存のノード（とその配下）を、別の既存ノードの前提/中身へ丸ごと移動します。移動すると元の親からは外れます（常に親は1つだけ）。</li>
        <li><b>ノード編集モーダルの前提/中身欄</b>: 既存ノードの編集画面で、名前検索により既存の任意のノードを前提/中身として追加・削除できます。1つのノードを複数の親から参照させたい場合（共有素材など）はこちらを使ってください。</li>
      </ul>
      <p>最初のうちは付け替えは使わず、ゴールとWFCD自動生成だけで構成するのがおすすめです。自動生成した内容を「こなすべきタスク」としてそのまま扱うイメージです。グラフがどこまで複雑になっていくかは開発者本人もまだ未知数な部分があるので、興味があれば付け替えも試してみてください。</p>`,
      en: `<p>There are three ways to build the <code>requires</code> / <code>contains</code> relationships between nodes, each for a different purpose.</p>
      <ul>
        <li><b>“Add prerequisite” / “Add content” in the inspector</b>: a shortcut that creates one new node and attaches it to the selected node on the spot.</li>
        <li><b>Reattach</b>: moves an existing node (and everything under it) wholesale onto another existing node. Moving it detaches it from its old parent — a node always has exactly one.</li>
        <li><b>The prerequisite/content fields in the node edit modal</b>: search existing nodes by name and add or remove them as prerequisites/contents. Use this when one node should be referenced by several parents, e.g. a shared resource.</li>
      </ul>
      <p>To begin with, it's easier to skip reattaching and build everything from goals plus the WFCD wizard, treating what it generates as the task list to work through. Even the author doesn't yet know how complex these graphs get in practice, so try reattaching once you're curious.</p>`,
    },
    targetId: "add-requires-btn",
  },
  {
    // 中の4トピック（inspector-node-id以下）のtargetIdはどれもノード選択中
    // にしかDOMへ存在しない（Inspectorがそもそも「ノードを選択してくだ
    // さい」というプレースホルダーのままだと#ph-node-id等が無い）。
    // セクション見出しはグループ先頭のトピックが表示されて初めて出る仕組み
    // （render()参照）なので、先頭をこの常時表示トピックにして
    // #panel-body（未選択時も存在する枠自体）に向けておく——じゃないと
    // 何も選択していない状態でマニュアルを開くと「詳細パネル」セクション
    // 自体が丸ごと消える（2026-08-30、のっち報告で発覚）。
    id: "inspector-overview",
    title: { ja: "詳細パネルについて", en: "About the detail panel" },
    section: SECTION_INSPECTOR,
    body: {
      ja: `<p>Chain View本体でノードをクリックすると、右側にこのパネルが開き、選択中のノードの操作ができます。上部には次の情報が並びます。</p>
      <ul>
        <li><b>名前・ID</b>: 詳細は「ノード名横のID」を参照</li>
        <li><b>種別</b>: Build/Goal/Frame/Weapon/Relic等、ノードの種類</li>
        <li><b>状態バッジ</b>: 色分けの意味は凡例（達成済み/実行可能/前提待ち、選択中のBuild自体なら「起点」）と共通です</li>
        <li>Relicノードのみ、Vault済み（廃止済みレリック）・Resurgence在庫あり（Prime Resurgenceで今買える、両方同時に付くこともあります）のバッジが追加で出ます</li>
      </ul>`,
      en: `<p>Clicking a node in Chain View opens this panel on the right, where you act on the selected node. Along the top you get:</p>
      <ul>
        <li><b>Name and ID</b>: see “The ID next to a node's name”</li>
        <li><b>Type</b>: Build/Goal/Frame/Weapon/Relic and so on</li>
        <li><b>State badge</b>: the colours mean the same as in the legend (satisfied / actionable / blocked, or “root” for the selected build itself)</li>
        <li>Relic nodes also get badges for vaulted (retired relic) and in Resurgence (buyable right now through Prime Resurgence) — both can apply at once</li>
      </ul>`,
    },
    targetId: "panel-body",
  },
  {
    id: "inspector-node-id",
    title: { ja: "ノード名横のID", en: "The ID next to a node's name" },
    body: {
      ja: "名前の右にカッコ書きで出ている英数字が、このノードのID（内部的な一意識別子で、表示名とは別物）です。「付け替え」の「移動先ノードのID」欄など、IDを直接指定する操作で使います。",
      en: "The alphanumeric string in brackets to the right of the name is the node's ID — an internal unique identifier, separate from its display name. You need it wherever an ID is entered directly, such as the “target node ID” field when reattaching.",
    },
    targetId: "ph-node-id",
  },
  {
    id: "inspector-toggle",
    title: { ja: "達成状態の切り替え", en: "Toggling the done state" },
    body: {
      ja: "選択中のノードを「達成にする/取り消す」で切り替えられます。マスタリー担当パーツのノードには、達成とは別に「メッキする/メッキ済み」ボタンも並びます。",
      en: "Marks the selected node done, or undoes it. Nodes for parts that carry mastery also get a separate gild button.",
    },
    targetId: "toggle-btn",
  },
  {
    id: "inspector-edit-archive",
    title: { ja: "編集・アーカイブ", en: "Edit and archive" },
    body: {
      ja: "「編集」で選択中のノードの名前・種別・メモ等を変更できます。目標（Build/Goal）ノードには、一覧から一時的に隠す「アーカイブする/解除」ボタンも並びます（削除ではなく非表示——目標一覧・集計から外れるだけでデータは残ります）。",
      en: "“Edit” changes the selected node's name, type, note and so on. Goal (Build/Goal) nodes also get an archive button that hides them from the list temporarily — that hides rather than deletes, dropping the node from the goal list and the roll-ups while keeping the data.",
    },
    targetId: "edit-btn",
  },
  {
    id: "inspector-note-counter",
    title: { ja: "メモ・カウントアップ", en: "Notes and counters" },
    body: {
      ja: "選択中のノードごとに、個別のメモとカウントアップを持たせられます（ヘッダーの「クイックメモ」とは別物で、こちらは特定のノードに紐づきます）。パネル下部の「連携元」には、このノードをLoadouts/Collectionsから紐付けているアイテムがあれば一覧表示されます。",
      en: "Each node can carry its own note and counters — not the same thing as “Quick Memo” in the header, since these belong to one specific node. “Linked from” at the bottom of the panel lists any Loadouts/Collections items pointing at this node.",
    },
    targetId: "insp-add-counter-btn",
  },
  {
    id: "sidebar-toggle",
    title: { ja: "目標一覧の折りたたみ", en: "Collapsing the goal list" },
    section: SECTION_SIDEBAR,
    body: {
      ja: "左の目標一覧パネルを隠してChain View本体を広く使えます。ウィンドウが狭い時に便利です。状態は次回起動時も引き継がれます。",
      en: "Hides the goal list on the left so Chain View itself gets more room — handy in a narrow window. The state carries over to your next launch.",
    },
    targetId: "sidebar-toggle-btn",
  },
  {
    id: "sidebar-folder",
    title: { ja: "フォルダ分け", en: "Folders" },
    body: {
      ja: "「新規フォルダ」で、目標をグルーピングするフォルダを作れます（1階層のみ、入れ子は不可）。各行のフォルダアイコンから所属フォルダを変更、ゴミ箱アイコンからノードごと削除できます。フォルダ自体の名前変更・削除はフォルダ見出しの鉛筆/×アイコンから。",
      en: "“New folder” groups goals into folders — one level only, no nesting. The folder icon on each row moves it to another folder, and the bin icon deletes the node itself. Rename or delete a folder from the pencil / × icons on its heading.",
    },
    targetId: "new-folder-btn",
  },
  {
    id: "quest-progress",
    title: { ja: "クエスト進行状況の登録", en: "Recording quest progress" },
    section: SECTION_CROSS,
    body: {
      ja: "クリア済みのクエストにチェックを入れると、対応するネタバレ回避セクションの折りたたみが自動的に解除されます。Statsページの「クエスト進行状況」パネルでいつでも変更できます。",
      en: "Ticking a quest you have cleared automatically unlocks the spoiler-gated section that goes with it. You can change this at any time from the “Quest progress” panel on the Stats page.",
    },
    targetId: "quest-progress-panel",
  },
  {
    id: "chainview-link",
    title: { ja: "Chain Viewとの連携", en: "Linking to Chain View" },
    body: {
      ja: "Loadouts/Collectionsの各アイテムを登録するとき、Chain Viewのノードを紐付けられます。紐付けたアイテムは進捗状況がミニグラフで表示されるようになります。紐付けは登録時のみ設定可能で、後から編集はできません。",
      en: "When you register an item in Loadouts or Collections you can link it to a Chain View node, and a linked item then shows its progress as a mini-graph. The link can only be set at registration time; it can't be edited afterwards.",
    },
  },
  {
    id: "favorite",
    title: { ja: "お気に入り", en: "Favourites" },
    body: {
      ja: "一覧のお気に入りマークをオンにすると、一覧の先頭に固定表示されます。",
      en: "Turning on the favourite marker pins an entry to the front of its list.",
    },
  },
  {
    id: "manual-button",
    title: { ja: "マニュアルボタン", en: "The manual button" },
    body: {
      ja: "<p>今開いているこのマニュアルは、このボタンから開けます。</p>",
      en: "<p>This button opens the manual you are reading right now.</p>",
    },
    targetId: "manual-launcher-btn",
    section: SECTION_MENU,
  },
  {
    id: "menu",
    title: { ja: "メニュー", en: "Menu" },
    body: {
      ja: "<p>画面右上に常に表示される共通メニューです。どのページを開いていてもここにあります。</p>",
      en: "<p>The shared menu pinned to the top right of the screen. It is there on every page.</p>",
    },
    targetId: "top-right-bar",
  },
  {
    id: "scratch",
    title: { ja: "クイックメモ", en: "Quick Memo" },
    body: {
      ja: "Markdown記法対応の自由記述メモを画面上に浮かべておけます。太字・箇条書き・チェックリストが使えます（記法はメモパネル内の丸に!アイコンから確認できます）。",
      en: "A free-form note in Markdown that floats above the page. Bold, bullets and checklists all work — the (!) icon inside the panel shows the syntax.",
    },
    targetId: "scratch-toggle-btn",
  },
  {
    id: "booster",
    title: { ja: "タイマー", en: "Timers" },
    body: {
      ja: "ブースター等の残り時間を計測できます。プルダウンは固定期間専用、「+」から任意の日数/時間も指定できます。",
      en: "Counts down the time left on boosters and anything else. The dropdown covers the fixed purchasable durations; “+” takes any number of days/hours.",
    },
    targetId: "booster-toggle-btn",
  },
  {
    id: "theme",
    title: { ja: "テーマ切替", en: "Theme switch" },
    body: {
      ja: "ライト/ダークテーマを切り替えられます。",
      en: "Switches between the light and dark themes.",
    },
    targetId: "theme-toggle-btn",
  },
  {
    id: "locale",
    title: { ja: "言語切替", en: "Language switch" },
    body: {
      ja: "表示言語を日本語/Englishで切り替えられます。デフォルトはブラウザの言語設定に従い、選び直すとその選択が優先されます。なお、達成状態やメモなど入力した内容そのものは翻訳されません（入力した言語のまま表示されます）。",
      en: "Switches the display language between Japanese and English. It follows your browser's language setting by default, and your own choice wins once you make one. Note that what you typed in — node names, notes and so on — is never translated; it stays in the language you wrote it in.",
    },
    targetId: "locale-switch-widget",
  },
  {
    id: "scroll-top",
    title: { ja: "一番上に戻る", en: "Back to top" },
    body: {
      ja: "ページを下までスクロールした状態から、ワンクリックで先頭へ戻れます。",
      en: "Jumps back to the top of the page in one click.",
    },
    targetId: "scroll-top-btn",
  },
  {
    id: "kofi",
    title: { ja: "Ko-fi支援リンク", en: "Ko-fi support link" },
    body: {
      ja: "このツールへの投げ銭リンクです（任意）。",
      en: "An optional tip link for this tool.",
    },
    targetId: "kofi-link-btn",
  },
  {
    id: "privacy",
    title: { ja: "通信・データについて", en: "Network access and your data" },
    body: {
      ja: `<ul>
        <li>外部通信はWFCD・calamity-inc（いずれも公開Warframeデータプロジェクト）からアイテム/MOD/クエスト等のゲームデータを読み取り専用で取得するのみ。個人情報の送受信は行いません</li>
        <li>達成状態・MOD構成・Riven記録・メモ等、入力した内容はすべてローカルの<code>data/*.json</code>に保存されるだけで、外部には一切送信されません。エラー診断用ログも同様にローカル保存のみです</li>
        <li>不具合・バグが発生した場合、原因調査のためこれらのJSONファイルの提出をお願いすることがあります（こちらから依頼した時のみ・任意提出）</li>
        <li>連絡先・バグ報告: <a href="https://x.com/motimotinotch" target="_blank" rel="noopener noreferrer">X @motimotinotch</a></li>
      </ul>`,
      en: `<ul>
        <li>The only outbound traffic is a read-only fetch of game data (items, mods, quests and so on) from WFCD and calamity-inc, both public Warframe data projects. No personal data is sent or received</li>
        <li>Everything you enter — done states, mod configs, Riven records, notes — is stored in local <code>data/*.json</code> files and never sent anywhere. Diagnostic logs are likewise local only</li>
        <li>If you hit a bug, you may be asked to send those JSON files to help track down the cause (only if asked, and always optional)</li>
        <li>Contact and bug reports: <a href="https://x.com/motimotinotch" target="_blank" rel="noopener noreferrer">X @motimotinotch</a></li>
      </ul>`,
    },
    section: SECTION_OTHER,
  },
  {
    id: "easter-egg",
    title: { ja: "おまけ", en: "One more thing" },
    body: {
      ja: "このツールにはイースターエッグがあります。探してみてください。",
      en: "There is an easter egg in this tool. See if you can find it.",
    },
  },
];

interface ChromeStrings {
  // Index signature so applyI18nText() can consume this table for the two
  // static bits of manual.html markup (the sidebar heading, the subtitle).
  [key: string]: string;
  manualHeading: string;
  docTitle: string;
  targetMissing: string;
  noOpener: string;
  noTopics: string;
  locate: string;
}

const CHROME: Record<Locale, ChromeStrings> = {
  ja: {
    manualHeading: "マニュアル",
    docTitle: "Warframe State Graph — マニュアル",
    targetMissing:
      "このページには対象のボタンが見つかりませんでした。該当するページを開いた状態で、そのページのマニュアルボタンから開き直してください。",
    noOpener: "呼び出し元のページが見つかりません。各ページのnavにあるマニュアルボタンから開き直してください。",
    noTopics: "このページに関するトピックはまだありません。",
    locate: "ボタンの場所を確認",
  },
  en: {
    manualHeading: "Manual",
    docTitle: "Warframe State Graph — Manual",
    targetMissing:
      "That button isn't on this page. Open the page it belongs to, then reopen the manual from that page's manual button.",
    noOpener: "Can't find the page that opened this. Reopen the manual from the manual button in a page's nav.",
    noTopics: "No topics for this page yet.",
    locate: "Show me where",
  },
};

function chrome(): ChromeStrings {
  return CHROME[locale()];
}

function getOpener(): Window | null {
  try {
    const o = window.opener as Window | null;
    if (!o || o.closed) return null;
    void o.document; // same-origin access check; throws if cross-origin
    return o;
  } catch {
    return null;
  }
}

function highlightInOpener(opener: Window, targetId: string, statusEl: HTMLElement): void {
  const target = opener.document.getElementById(targetId);
  if (!target) {
    statusEl.textContent = chrome().targetMissing;
    return;
  }
  statusEl.textContent = "";
  opener.focus();
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  flashHighlight(target);
}

// Topics with a targetId only make sense on a page that actually has that
// element — e.g. quest-progress-panel only exists on stats.html. Topics
// without a targetId describe page-wide/cross-page behavior, so they're
// always shown. When there's no opener at all, show everything (can't check
// relevance) with locate buttons disabled.
function visibleTopics(opener: Window | null): ManualTopic[] {
  if (!opener) return MANUAL_TOPICS;
  return MANUAL_TOPICS.filter((t) => !t.targetId || opener.document.getElementById(t.targetId));
}

function render(): void {
  const opener = getOpener();
  const statusEl = document.getElementById("opener-status")!;
  const toc = document.getElementById("toc")!;
  const container = document.getElementById("topics")!;

  document.title = chrome().docTitle;
  applyI18nText(CHROME);
  statusEl.textContent = opener ? "" : chrome().noOpener;

  const topics = visibleTopics(opener);

  if (!topics.length) {
    toc.innerHTML = "";
    container.innerHTML = `<div class="empty">${chrome().noTopics}</div>`;
    return;
  }

  // section is only set on the first topic of each group in MANUAL_TOPICS;
  // a filtered-out first topic would silently drop its heading, but every
  // current group leader is always-visible (see comment on MANUAL_TOPICS),
  // so this holds in practice.
  toc.innerHTML = topics
    .map(
      (t) =>
        (t.section ? `<div class="toc-section">${tx(t.section)}</div>` : "") +
        `<button class="toc-item" data-toc="${t.id}">${tx(t.title)}</button>`,
    )
    .join("");
  container.innerHTML = topics
    .map(
      (t) => `
      ${t.section ? `<div class="content-section">${tx(t.section)}</div>` : ""}
      <div class="topic" id="topic-${t.id}">
        <h2>${tx(t.title)}</h2>
        <div class="topic-body">${tx(t.body)}</div>
        ${t.targetId ? `<button class="locate-btn" data-target="${t.targetId}" ${opener ? "" : "disabled"}>${chrome().locate}</button>` : ""}
        <div class="locate-status"></div>
      </div>`,
    )
    .join("");

  toc.querySelectorAll<HTMLButtonElement>(".toc-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.getElementById(`topic-${btn.dataset.toc}`)!.scrollIntoView({ behavior: "smooth", block: "start" });
      toc.querySelectorAll(".toc-item").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
    });
  });

  if (!opener) return;
  container.querySelectorAll<HTMLButtonElement>(".locate-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const statusEl2 = btn.closest(".topic")!.querySelector<HTMLElement>(".locate-status")!;
      highlightInOpener(opener, btn.dataset.target!, statusEl2);
    });
  });
}

render();
// The whole manual is rebuilt from the topic table, so a language switch just
// re-renders. This window has its own locale widget (manual.html), and the
// choice is shared through localStorage with the page that opened it.
onLocaleChange(render);
