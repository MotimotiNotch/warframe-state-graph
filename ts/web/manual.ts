// Entry script for the standalone manual.html window (opened by
// manual-launcher.ts via window.open). Reads the calling page's DOM through
// window.opener (same-origin) to highlight the button a topic is about, so
// のっち can keep both windows visible side by side while reading.
import "./theme.ts";
import { flashHighlight } from "./highlight.ts";

interface ManualTopic {
  id: string;
  title: string;
  body: string;
  /** DOM id, in the opener document, this topic is about. Omitted for a
   * page-wide behavior with no single anchor element to highlight. */
  targetId?: string;
  /** TOC/content section heading rendered directly above this topic.
   * 2026-08-27: page-specific topics and the always-present top-right-bar
   * menu items were interleaved in one flat list with no visual grouping,
   * making it unclear the menu items are the same shared widget on every
   * page (のっち指摘). Set only on the first topic of each group — render()
   * inserts the heading whenever it differs from the previous topic's. */
  section?: string;
}

// 2026-08-27: covers the always-visible shared widgets (top-right-bar icons)
// plus a couple of easy-to-miss cross-page behaviors. Deliberately excludes
// the header-icon/wallpaper picker (bindHeaderIconEasterEgg in wallpaper.ts)
// — that's an intentional undocumented easter egg (click the page's own
// logo), not something a manual should spell out.
const MANUAL_TOPICS: ManualTopic[] = [
  {
    id: "page-chainview",
    title: "Chain View",
    section: "ページ",
    body: "<p>ゲーム内の依存関係グラフと自分の進行状況を接続し、次にやるべきことを動的に導き出すメインページです。ノードの状態については「凡例」を参照してください。</p>",
  },
  {
    id: "page-loadouts",
    title: "Loadouts",
    body: `<p>フレーム/武器ごとのMODコンフィグ（A/B/C）とビルドセットの管理ページです。</p>
      <ul>
        <li>Itemsは種別（Frame/Weapon/Companion/Archwing/Necramech）ごとにサブセクション分けされています</li>
        <li>星マーク（★）は「今のビルドで使ってる/優先度高い」という主観マーカーで、お気に入りが各セクションの先頭に並びます（並び順は起動時点で固定され、編集中に急に順番が変わることはありません）</li>
        <li>各セクションは右上のアイコンで開閉でき、状態は次回起動時も引き継がれます</li>
        <li>名前で絞り込み検索ができます。8件を超える分は「もっと見る」で表示／折りたたみを切り替えられます</li>
        <li>見出し横の＋アイコンから新規登録できます</li>
        <li>Chain Viewと連携済みのアイテムには、カード内に進捗のミニグラフが表示されます（色の意味はItems見出し横の凡例を参照。点にカーソルを合わせると内訳が出ます）</li>
      </ul>
      <p class="caution">⚠️ フレーム/武器名やビルド名など、未プレイのコンテンツ名が表示されることがあります。</p>`,
  },
  {
    id: "page-collections",
    title: "Collections",
    body: `<p>Chain View / Loadoutsとは独立した、フレーム/Riven/Kuvaの入手状況ログです。</p>
      <ul>
        <li>緑のアイコンは「達成済み」、灰色は「未達成」。1枚に複数の指標がある場合はアイコンの形でカテゴリを区別しています</li>
        <li>星マーク（★）は「今のビルドで使ってる/優先度高い」という主観マーカーで、状態アイコンとは独立して立てられます。お気に入りが先頭に並びます</li>
      </ul>
      <p class="caution">⚠️ 一部のセクションは前提クエストクリア後にのみ内容が明らかになります。</p>`,
  },
  {
    id: "page-standing",
    title: "Standing",
    body: `<p>全18シンジケート（Conclave/Cephalon Simarisを除く）の現在ランクを記録する場所です。</p>
      <ul>
        <li>6大シンジケート（Steel Meridian/Arbiters of Hexis/Cephalon Suda ⇔ Red Veil/The Perrin Sequence/New Loka）は2陣営が敵対関係にあり、片方を上げるともう片方が下がりうる（0を割ると降格し最大Rank -2まで下降）。そのためChain Viewの<code>requires</code>連鎖トグルとは別に、現在ランクの値そのものを直接保持・更新します</li>
        <li>他の12シンジケートは敵対関係を持たず、ランクは0以上のみ</li>
        <li>貢献アイテムの中身は一部シンジケートで実データからの解釈が確定できず「不明」表示のままのものがあります</li>
        <li>武器購入に必要な特定ランクの管理はChain View側のノード生成（WFCD自動生成のシンジケート候補）を使ってください</li>
      </ul>
      <p class="caution">⚠️ シンジケート武器名など、未プレイのコンテンツ名が表示されることがあります。</p>`,
  },
  {
    id: "page-stats",
    title: "Stats",
    body: `<p>上段は既存4データソース（Chain View/Loadouts/Collections/Standing）の読み取り専用集計です。</p>
      <ul>
        <li>「クエスト進行状況」パネルでクリア済みのクエストにチェックを入れると、対応する下段の追加セクションの折りたたみが解除されます</li>
        <li>星図/鋼の道のり/性能値（Intrinsics）は、惑星・地域単位の粗い進捗（ノード個別トグルは持たない）を記録する数値入力欄です</li>
        <li>すべてのパネルは右上のアイコンで開閉でき、状態は次回起動時も引き継がれます</li>
      </ul>
      <p class="caution">⚠️ 惑星名などにネタバレを含むことがあります。対応するクエストをクリア済みでないセクションは、内容を明かさないよう折りたたんだままにしています。</p>`,
  },
  {
    id: "page-note",
    title: "Note",
    body: "<p>1ページだけの大きなMarkdownメモです。ヘッダーの「クイックメモ」（小さな付箋、常時どのページからも開ける）とは別物で、こちらは定期的に見返す用の場所という位置づけです。書いた内容はそのまま自動保存されます。</p>",
  },
  {
    id: "wfcd-refresh",
    title: "WFCDデータ更新",
    section: "Chain View — グラフ操作",
    body: "新フレーム/新武器等がゲームアップデートで追加されたのに候補に出てこない時に押してください。",
    targetId: "refresh-wfcd-btn",
  },
  {
    id: "wfcd-asof",
    title: "WFCDデータの取得日時",
    section: "Chain View — グラフ操作",
    body: `<p>更新ボタンの左にある「WFCD ○○」は、外部データをいつ取得したかの表示です（データはファイル単位で取り込まれるため、もっとも古いものの日付を出しています）。</p>
      <p>これが必要なのは、レリックのVault判定が「ドロップ表に載っていないこと」を根拠にしているからです。データが古いと、実際には入手できるレリックがVault済と表示される——つまり「情報が無い」ではなく「間違った答え」になります。古ければ隣の更新ボタンで全部取り直せます。</p>`,
    targetId: "wfcd-asof",
  },
  {
    id: "update-follow-up",
    title: "アップデートへの追従について",
    body: `<p>ゲームアップデートへの追従は、対応の仕方が2段階に分かれます。</p>
      <ul>
        <li><b>更新ボタンで自動的に反映されるもの</b>: フレーム/武器/MOD/レリック名の候補、Kuva/Tenet/Coda等の判定、シンジケート武器のランク逆引き、日本語名など、外部データを都度取り直す仕組みの範囲</li>
        <li><b>コード側の修正が必要なもの</b>: クエストの前提関係、シンジケートのランク名・陣営構成、Steel Path対象外の惑星リストなど、Wikiの内容を元にした固定表で持っている情報。ゲームアップデートで変更があっても更新ボタンでは反映されません</li>
      </ul>
      <p>新しいエリアや進行システムがまるごと追加されるような大型アップデートは、そもそも新規の設計・実装が必要になります。</p>`,
  },
  {
    id: "legend",
    title: "凡例",
    body: "ノードの色・アイコンが何を表しているかを確認できます。",
    targetId: "legend-toggle",
  },
  {
    id: "compact-toggle",
    title: "コンパクト表示",
    body: "グラフ本体をより狭いスペースで表示します。ウィンドウ幅が狭い時は自動でも切り替わります。",
    targetId: "compact-toggle",
  },
  {
    id: "requires-contains-editing",
    title: "前提・中身を編集する3つの方法",
    body: `<p>ノード同士の前提（requires）・中身（contains）の関係を作る方法は3つあり、用途が異なります。</p>
      <ul>
        <li><b>Inspectorの「前提を追加」「中身を追加」</b>: 選択中のノードの子として、新規ノードを1個作ってその場で繋ぐショートカットです。</li>
        <li><b>付け替え</b>: 既存のノード（とその配下）を、別の既存ノードの前提/中身へ丸ごと移動します。移動すると元の親からは外れます（常に親は1つだけ）。</li>
        <li><b>ノード編集モーダルの前提/中身欄</b>: 既存ノードの編集画面で、名前検索により既存の任意のノードを前提/中身として追加・削除できます。1つのノードを複数の親から参照させたい場合（共有素材など）はこちらを使ってください。</li>
      </ul>
      <p>最初のうちは付け替えは使わず、ゴールとWFCD自動生成だけで構成するのがおすすめです。自動生成した内容を「こなすべきタスク」としてそのまま扱うイメージです。グラフがどこまで複雑になっていくかは開発者本人もまだ未知数な部分があるので、興味があれば付け替えも試してみてください。</p>`,
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
    title: "詳細パネルについて",
    section: "Chain View — 詳細パネル",
    body: `<p>Chain View本体でノードをクリックすると、右側にこのパネルが開き、選択中のノードの操作ができます。上部には次の情報が並びます。</p>
      <ul>
        <li><b>名前・ID</b>: 詳細は「ノード名横のID」を参照</li>
        <li><b>種別</b>: Build/Goal/Frame/Weapon/Relic等、ノードの種類</li>
        <li><b>状態バッジ</b>: 色分けの意味は凡例（達成済み/実行可能/前提待ち、選択中のBuild自体なら「起点」）と共通です</li>
        <li>Relicノードのみ、Vault済み（廃止済みレリック）・Resurgence在庫あり（Prime Resurgenceで今買える、両方同時に付くこともあります）のバッジが追加で出ます</li>
      </ul>`,
    targetId: "panel-body",
  },
  {
    id: "inspector-node-id",
    title: "ノード名横のID",
    body: "名前の右にカッコ書きで出ている英数字が、このノードのID（内部的な一意識別子で、表示名とは別物）です。「付け替え」の「移動先ノードのID」欄など、IDを直接指定する操作で使います。",
    targetId: "ph-node-id",
  },
  {
    id: "inspector-toggle",
    title: "達成状態の切り替え",
    body: "選択中のノードを「達成にする/取り消す」で切り替えられます。マスタリー担当パーツのノードには、達成とは別に「メッキする/メッキ済み」ボタンも並びます。",
    targetId: "toggle-btn",
  },
  {
    id: "inspector-edit-archive",
    title: "編集・アーカイブ",
    body: "「編集」で選択中のノードの名前・種別・メモ等を変更できます。目標（Build/Goal）ノードには、一覧から一時的に隠す「アーカイブする/解除」ボタンも並びます（削除ではなく非表示——目標一覧・集計から外れるだけでデータは残ります）。",
    targetId: "edit-btn",
  },
  {
    id: "inspector-note-counter",
    title: "メモ・カウントアップ",
    body: "選択中のノードごとに、個別のメモとカウントアップを持たせられます（ヘッダーの「クイックメモ」とは別物で、こちらは特定のノードに紐づきます）。パネル下部の「連携元」には、このノードをLoadouts/Collectionsから紐付けているアイテムがあれば一覧表示されます。",
    targetId: "insp-add-counter-btn",
  },
  {
    id: "sidebar-toggle",
    title: "目標一覧の折りたたみ",
    section: "Chain View — 目標一覧",
    body: "左の目標一覧パネルを隠してChain View本体を広く使えます。ウィンドウが狭い時に便利です。状態は次回起動時も引き継がれます。",
    targetId: "sidebar-toggle-btn",
  },
  {
    id: "sidebar-folder",
    title: "フォルダ分け",
    body: "「新規フォルダ」で、目標をグルーピングするフォルダを作れます（1階層のみ、入れ子は不可）。各行のフォルダアイコンから所属フォルダを変更、ゴミ箱アイコンからノードごと削除できます。フォルダ自体の名前変更・削除はフォルダ見出しの鉛筆/×アイコンから。",
    targetId: "new-folder-btn",
  },
  {
    id: "quest-progress",
    title: "クエスト進行状況の登録",
    section: "横断的な機能",
    body: "クリア済みのクエストにチェックを入れると、対応するネタバレ回避セクションの折りたたみが自動的に解除されます。Statsページの「クエスト進行状況」パネルでいつでも変更できます。",
    targetId: "quest-progress-panel",
  },
  {
    id: "chainview-link",
    title: "Chain Viewとの連携",
    body: "Loadouts/Collectionsの各アイテムを登録するとき、Chain Viewのノードを紐付けられます。紐付けたアイテムは進捗状況がミニグラフで表示されるようになります。紐付けは登録時のみ設定可能で、後から編集はできません。",
  },
  {
    id: "favorite",
    title: "お気に入り",
    body: "一覧のお気に入りマークをオンにすると、一覧の先頭に固定表示されます。",
  },
  {
    id: "manual-button",
    title: "マニュアルボタン",
    body: "<p>今開いているこのマニュアルは、このボタンから開けます。</p>",
    targetId: "manual-launcher-btn",
    section: "メニュー",
  },
  {
    id: "menu",
    title: "メニュー",
    body: "<p>画面右上に常に表示される共通メニューです。どのページを開いていてもここにあります。</p>",
    targetId: "top-right-bar",
  },
  {
    id: "scratch",
    title: "クイックメモ",
    body: "Markdown記法対応の自由記述メモを画面上に浮かべておけます。太字・箇条書き・チェックリストが使えます（記法はメモパネル内の丸に!アイコンから確認できます）。",
    targetId: "scratch-toggle-btn",
  },
  {
    id: "booster",
    title: "タイマー",
    body: "ブースター等の残り時間を計測できます。プルダウンは固定期間専用、「+」から任意の日数/時間も指定できます。",
    targetId: "booster-toggle-btn",
  },
  {
    id: "theme",
    title: "テーマ切替",
    body: "ライト/ダークテーマを切り替えられます。",
    targetId: "theme-toggle-btn",
  },
  {
    id: "locale",
    title: "言語切替",
    body: "モーダル等の一部の文言を日本語/Englishで切り替えられます（現状、ページ本体のnav/ボタン等は対象外で、常に日本語表示のままです）。デフォルトはブラウザの言語設定に従い、選び直すとその選択が優先されます。",
    targetId: "locale-switch-widget",
  },
  {
    id: "scroll-top",
    title: "一番上に戻る",
    body: "ページを下までスクロールした状態から、ワンクリックで先頭へ戻れます。",
    targetId: "scroll-top-btn",
  },
  {
    id: "kofi",
    title: "Ko-fi支援リンク",
    body: "このツールへの投げ銭リンクです（任意）。",
    targetId: "kofi-link-btn",
  },
  {
    id: "privacy",
    title: "通信・データについて",
    body: `<ul>
        <li>外部通信はWFCD・calamity-inc（いずれも公開Warframeデータプロジェクト）からアイテム/MOD/クエスト等のゲームデータを読み取り専用で取得するのみ。個人情報の送受信は行いません</li>
        <li>達成状態・MOD構成・Riven記録・メモ等、入力した内容はすべてローカルの<code>data/*.json</code>に保存されるだけで、外部には一切送信されません。エラー診断用ログも同様にローカル保存のみです</li>
        <li>不具合・バグが発生した場合、原因調査のためこれらのJSONファイルの提出をお願いすることがあります（こちらから依頼した時のみ・任意提出）</li>
        <li>連絡先・バグ報告: <a href="https://x.com/motimotinotch" target="_blank" rel="noopener noreferrer">X @motimotinotch</a></li>
      </ul>`,
    section: "その他",
  },
  {
    id: "easter-egg",
    title: "おまけ",
    body: "このツールにはイースターエッグがあります。探してみてください。",
  },
];

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
    statusEl.textContent = "このページには対象のボタンが見つかりませんでした。該当するページを開いた状態で、そのページのマニュアルボタンから開き直してください。";
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

  statusEl.textContent = opener
    ? ""
    : "呼び出し元のページが見つかりません。各ページのnavにあるマニュアルボタンから開き直してください。";

  const topics = visibleTopics(opener);

  if (!topics.length) {
    toc.innerHTML = "";
    container.innerHTML = `<div class="empty">このページに関するトピックはまだありません。</div>`;
    return;
  }

  // section is only set on the first topic of each group in MANUAL_TOPICS;
  // a filtered-out first topic would silently drop its heading, but every
  // current group leader is always-visible (see comment on MANUAL_TOPICS),
  // so this holds in practice.
  toc.innerHTML = topics
    .map(
      (t) =>
        (t.section ? `<div class="toc-section">${t.section}</div>` : "") +
        `<button class="toc-item" data-toc="${t.id}">${t.title}</button>`,
    )
    .join("");
  container.innerHTML = topics
    .map(
      (t) => `
      ${t.section ? `<div class="content-section">${t.section}</div>` : ""}
      <div class="topic" id="topic-${t.id}">
        <h2>${t.title}</h2>
        <div class="topic-body">${t.body}</div>
        ${t.targetId ? `<button class="locate-btn" data-target="${t.targetId}" ${opener ? "" : "disabled"}>ボタンの場所を確認</button>` : ""}
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
