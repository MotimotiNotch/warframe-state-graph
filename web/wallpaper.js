// 背景壁紙機能。任意の画像をブラウザのlocalStorageにdata URLとして保存し、
// 全ページ共通で薄く背景に敷く。サーバー側の保存・APIは持たない
// （booster.jsと同じ、両ページのbody末尾で読み込むだけで動く自己完結ウィジェット）。
//
// 操作の起点はヘッダーアイコンクリック時の中央モーダル1つに一本化してある（2026-08-18）。
// 当初は画面左下に常時表示のウィジェットも別途あったが、「ヘッダーアイコンのポップアップに
// しまえる？」の指定を受けて統合し、常時表示の左下ウィジェットは廃止した。
(function () {
  const STORAGE_KEY = "warframe-state-graph:wallpaper";
  const OPACITY = 0.28; // あくまで背景なので薄く。数値を上げると濃くなる（0.12→0.28、2026-08-18）。
  const WARN_BYTES = 3 * 1024 * 1024; // 3MB超は保存失敗しやすいので事前警告する目安

  // アイコン（ヘッダーの.app-icon ＋ ブラウザタブのfavicon）の差し替え。
  // 壁紙とは独立したlocalStorageキーで持つ（サイズ/位置のような付加設定は不要、画像単体のみ）。
  const ICON_STORAGE_KEY = "warframe-state-graph:custom-icon";
  const ICON_WARN_BYTES = 1 * 1024 * 1024; // アイコン用途なので壁紙より小さい閾値で警告
  const DEFAULT_ICON_SRC = "/favicon.svg";

  // サイズモード（画面を埋める/全体を収める/タイル）は選択肢として不要とのことで撤去
  // （2026-08-18）。表示は常に「画面を埋める」固定。
  // 位置は9択プルダウンではなく、プレビュー内でドラッグして決める
  // （Portfolio側のサムネイル切り抜きモーダルと同じ直接操作の発想、ただしクロップ/出力はせず
  // background-position の割合を決めるだけなので、cropperjsのような外部ライブラリは使わず自前実装）。
  // blur: パネル全体のガラスのぼかし強さ（px）。壁紙の有無に関わらず効く設定だが、
  // 「壁紙を選ぶ時に一緒に調整できるといい」という要望（2026-08-18）でこの設定オブジェクトに同居させた。
  const DEFAULT_SETTINGS = { image: null, posX: 50, posY: 50, blur: 5 };
  const BLUR_MIN = 0;
  const BLUR_MAX = 24;

  // 用語マッピング（pkg/glossary、2026-08-19追加）。壁紙/アイコン/ぼかしと同じ統合モーダルに
  // タブとして同居させる（既存の統合方針の延長）。サーバー保存のためlocalStorageではなく
  // fetch経由。モーダルを開くたびに再取得はせず、初回だけ取得してモジュール内にキャッシュする。
  let modalTab = "display";
  let glossaryCache = null;

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  async function fetchGlossary() {
    try {
      const res = await fetch("/api/glossary");
      glossaryCache = res.ok ? await res.json() : { entries: {} };
    } catch (e) {
      glossaryCache = { entries: {} };
    }
    refreshHeaderIconModal();
  }

  async function saveGlossaryEntry(entry) {
    const res = await fetch("/api/glossary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry),
    });
    if (res.ok) glossaryCache = await res.json();
    refreshHeaderIconModal();
  }

  async function deleteGlossaryEntry(enKey) {
    const res = await fetch(`/api/glossary/${encodeURIComponent(enKey)}`, { method: "DELETE" });
    if (res.ok) glossaryCache = await res.json();
    refreshHeaderIconModal();
  }

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (e) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(settings) {
    try {
      // blurのようにimageが無くても意味を持つ設定があるため、imageの有無で
      // ストレージキー自体を消す/残すの判断はしない（以前はimage無しで丸ごと消えるバグがあった）。
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
      return true;
    } catch (e) {
      // localStorageの容量超過（大きすぎる画像）等
      return false;
    }
  }

  function applyPanelBlur(px) {
    const clamped = Math.min(BLUR_MAX, Math.max(BLUR_MIN, Number(px) || 0));
    document.documentElement.style.setProperty("--panel-blur", `${clamped}px`);
  }

  function loadCustomIcon() {
    try {
      return localStorage.getItem(ICON_STORAGE_KEY);
    } catch (e) {
      return null;
    }
  }

  function saveCustomIcon(dataUrl) {
    try {
      if (dataUrl) localStorage.setItem(ICON_STORAGE_KEY, dataUrl);
      else localStorage.removeItem(ICON_STORAGE_KEY);
      return true;
    } catch (e) {
      return false;
    }
  }

  function applyCustomIcon(dataUrl) {
    const src = dataUrl || DEFAULT_ICON_SRC;
    document.querySelectorAll(".app-icon").forEach((img) => {
      img.src = src;
    });
    const link = document.querySelector('link[rel="icon"]');
    if (link) {
      link.href = src;
      if (dataUrl) {
        // data URL側の実MIMEタイプと食い違うと無視されるブラウザがあるため、
        // カスタム画像適用時はtype属性を外してブラウザに自動判定させる。
        link.removeAttribute("type");
      } else {
        link.setAttribute("type", "image/svg+xml");
      }
    }
  }

  function applyWallpaper(settings) {
    if (settings.image) {
      // 巨大なdata URL（数MB級）をCSS変数(--wallpaper-image)に入れると、Chromium系ブラウザが
      // 黙って値を破棄する（getPropertyValueが空文字になる、エラーは出ない）ため反映されない
      // 不具合があった。ネイティブのbackground-imageプロパティに直接同じ長さの値を設定すると
      // 問題なく通ることを実機検証済みなので、CSS変数経由をやめて直接設定する（2026-08-22）。
      document.body.style.backgroundImage =
        `linear-gradient(color-mix(in srgb, var(--bg) ${(1 - OPACITY) * 100}%, transparent), color-mix(in srgb, var(--bg) ${(1 - OPACITY) * 100}%, transparent)), url("${settings.image}")`;
      document.body.style.setProperty("--wallpaper-position", `${settings.posX}% ${settings.posY}%`);
      document.body.classList.add("has-wallpaper");
    } else {
      document.body.style.removeProperty("background-image");
      document.body.style.removeProperty("--wallpaper-position");
      document.body.classList.remove("has-wallpaper");
    }
  }

  function injectStyle() {
    const style = document.createElement("style");
    // body自体のbackground-color（既存の--bg）の上に、bg色を88%(=1-OPACITY)濃さで
    // 塗った半透明グラデーションと壁紙画像を重ねて合成する。これによりテキスト等の
    // 前景要素には一切opacityをかけず、背景レイヤーだけを薄くできる。
    // 別要素+z-indexで重ねる方式は、bodyが独自のスタッキングコンテキストを持たない場合に
    // bodyの通常背景の下へ潜り込むことがあるため、body自身の背景合成に一本化した。
    style.textContent = `
      body.has-wallpaper {
        /* background-imageはapplyWallpaper()がインラインstyleで直接設定する（CSS変数経由だと
           巨大なdata URLがブラウザに黙って破棄されるため）。ここではposition/size等のみ扱う。 */
        background-size: auto, cover;
        background-position: center, var(--wallpaper-position, center);
        background-repeat: no-repeat, no-repeat;
        background-attachment: fixed, fixed;
      }

      #wallpaper-position-modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center; z-index: 210;
      }
      #wallpaper-position-modal .wp-box {
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a);
        border-radius: 18px; padding: 16px; width: min(480px, 90vw);
        font-family: "Noto Sans JP", -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        color: var(--text, #e4e6ec);
      }
      #wallpaper-position-modal h3 { margin: 0 0 4px; font-size: 1rem; }
      #wallpaper-position-modal .wp-hint { margin: 0 0 10px; font-size: 0.78rem; color: var(--muted, #9aa0ab); }
      #wallpaper-position-modal .wp-frame {
        position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden;
        border-radius: 8px; border: 1px solid var(--border, #2a2e3a);
        cursor: grab; touch-action: none; background: var(--bg, #12141a);
      }
      #wallpaper-position-modal .wp-frame.dragging { cursor: grabbing; }
      #wallpaper-position-modal .wp-frame img {
        position: absolute; top: 0; left: 0; width: 100%; height: 100%;
        user-select: none; -webkit-user-drag: none; pointer-events: none;
      }
      #wallpaper-position-modal .wp-buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }

      #header-icon-modal {
        position: fixed; inset: 0; background: rgba(0,0,0,0.55);
        display: flex; align-items: center; justify-content: center; z-index: 200;
        padding: 20px;
      }
      #header-icon-modal .hi-box {
        background: var(--panel, #1b1e27);
        backdrop-filter: blur(var(--panel-blur));
        -webkit-backdrop-filter: blur(var(--panel-blur));
        border: 1px solid var(--border, #2a2e3a);
        border-radius: 18px; padding: 16px; width: min(380px, 92vw);
        max-height: 84vh; overflow-y: auto;
        font-family: "Noto Sans JP", -apple-system, "Segoe UI", "Hiragino Sans", sans-serif;
        color: var(--text, #e4e6ec);
      }
      #header-icon-modal h3 { margin: 0 0 10px; font-size: 1rem; }
      #header-icon-modal .hi-tabs { display: flex; gap: 4px; margin-bottom: 10px; }
      #header-icon-modal .hi-tab {
        flex: 1; background: transparent; color: var(--muted, #9aa0ab);
        border: 1px solid var(--border, #2a2e3a); border-radius: 8px;
        padding: 6px 8px; font-size: 0.78rem; cursor: pointer; font-family: inherit;
      }
      #header-icon-modal .hi-tab.active {
        background: var(--bg, #12141a); color: var(--accent, #f6ddaa); border-color: var(--accent, #f6ddaa);
      }
      #header-icon-modal .hi-glossary-cat-title {
        font-size: 0.75rem; color: var(--muted, #9aa0ab); letter-spacing: 0.04em;
        text-transform: uppercase; margin: 10px 0 4px;
      }
      #header-icon-modal .hi-glossary-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
      #header-icon-modal .hi-glossary-table td { padding: 2px 0; vertical-align: middle; }
      #header-icon-modal .hi-glossary-en {
        font-size: 0.72rem; color: var(--muted, #9aa0ab); max-width: 120px;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 6px;
      }
      #header-icon-modal .hi-glossary-ja-input {
        width: 100%; background: var(--bg, #12141a); color: var(--text, #e4e6ec);
        border: 1px solid var(--border, #2a2e3a); border-radius: 6px;
        padding: 4px 6px; font-size: 0.78rem; font-family: inherit;
      }
      #header-icon-modal .hi-glossary-ja-input:focus { border-color: var(--accent, #f6ddaa); outline: none; }
      #header-icon-modal .hi-glossary-table .hi-glossary-del {
        width: auto; margin: 0 0 0 4px; padding: 4px 6px; line-height: 0;
      }
      #header-icon-modal .hi-glossary-add {
        display: flex; flex-direction: column; gap: 6px; margin-top: 10px;
        padding-top: 10px; border-top: 1px solid var(--border, #2a2e3a);
      }
      #header-icon-modal .hi-glossary-add input {
        background: var(--bg, #12141a); color: var(--text, #e4e6ec);
        border: 1px solid var(--border, #2a2e3a); border-radius: 6px;
        padding: 6px 8px; font-size: 0.78rem; font-family: inherit;
      }
      #header-icon-modal .hi-choice {
        width: 100%; display: flex; align-items: center; gap: 8px;
        background: var(--bg, #12141a); color: var(--text, #e4e6ec);
        border: 1px solid var(--border, #2a2e3a); border-radius: 10px;
        padding: 10px 12px; font-size: 0.88rem; cursor: pointer; margin-bottom: 8px;
        font-family: inherit;
      }
      #header-icon-modal .hi-choice:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
      #header-icon-modal .hi-choice.hi-reset { color: var(--muted, #9aa0ab); font-size: 0.8rem; padding: 7px 12px; }
      #header-icon-modal .hi-choice.hi-reset:hover { border-color: var(--danger, #e88c93); color: var(--danger, #e88c93); }
      #header-icon-modal .hi-sub {
        display: flex; flex-direction: column; gap: 6px;
        margin: -2px 0 10px; padding: 8px 10px;
        border: 1px solid var(--border, #2a2e3a); border-radius: 10px;
      }
      #header-icon-modal .hi-sub .hi-choice { margin-bottom: 0; }
      #header-icon-modal .hi-field {
        display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text, #e4e6ec);
      }
      #header-icon-modal .hi-field select { flex: 1; }
      #header-icon-modal .hi-field input[type=range] { flex: 1; }
      #header-icon-modal select {
        background: var(--bg, #12141a); color: var(--text, #e4e6ec); border: 1px solid var(--border, #2a2e3a);
        border-radius: 6px; padding: 4px 6px; font-size: 0.78rem; font-family: inherit;
      }
      #header-icon-modal .hi-blur-row { margin-bottom: 10px; }
      #header-icon-modal .hi-hint { font-size: 0.72rem; color: var(--muted, #9aa0ab); margin: 6px 0 0; }
      #header-icon-modal .hi-cancel-row { display: flex; justify-content: flex-end; margin-top: 10px; }
      #header-icon-modal .hi-cancel-row button {
        background: transparent; border: 1px solid var(--border, #2a2e3a); color: var(--muted, #9aa0ab);
        border-radius: 8px; padding: 5px 10px; font-size: 0.78rem; cursor: pointer; font-family: inherit;
      }
      #header-icon-modal .hi-cancel-row button:hover { border-color: var(--accent, #f6ddaa); color: var(--accent, #f6ddaa); }
    `;
    document.head.appendChild(style);
  }

  // 隠しファイル入力2つ（壁紙/アイコン）。モーダルの外、body直下に一度だけ作る。
  // モーダルは開閉のたびにDOMごと作り直すため、input要素をその中に置くと
  // ネイティブのファイル選択ダイアログが閉じるまでの間にモーダルを閉じた場合の
  // 挙動が不安定になりうる——外に出して参照を安定させる。
  function createHiddenInputs() {
    const wallpaperInput = document.createElement("input");
    wallpaperInput.type = "file";
    wallpaperInput.id = "wallpaper-input";
    wallpaperInput.accept = "image/*";
    wallpaperInput.style.display = "none";
    document.body.appendChild(wallpaperInput);
    wallpaperInput.addEventListener("change", () => {
      const file = wallpaperInput.files && wallpaperInput.files[0];
      if (!file) return;
      if (file.size > WARN_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        const proceed = confirm(
          `画像サイズが${mb}MBあり、ブラウザの保存容量制限で失敗する可能性がある。それでも設定を試す？`
        );
        if (!proceed) {
          wallpaperInput.value = "";
          return;
        }
      }
      const reader = new FileReader();
      reader.onload = () => {
        // 新しい画像を選ぶたびに位置は中央へリセットしてから、その場で位置調整モーダルを開く
        // （画像を選んだ直後に「位置を調整」ボタンを別途押させるのは一手間なので自動遷移にした、2026-08-18）。
        const next = { ...loadSettings(), image: reader.result, posX: 50, posY: 50 };
        if (!saveSettings(next)) {
          alert("画像が大きすぎて保存できなかった。もう少し軽い画像を試して。");
          return;
        }
        applyWallpaper(next);
        refreshHeaderIconModal();
        openPositionModal(next, (x, y) => {
          const withPos = { ...next, posX: x, posY: y };
          saveSettings(withPos);
          applyWallpaper(withPos);
          refreshHeaderIconModal();
        });
      };
      reader.readAsDataURL(file);
    });

    const iconInput = document.createElement("input");
    iconInput.type = "file";
    iconInput.id = "icon-input";
    iconInput.accept = "image/*";
    iconInput.style.display = "none";
    document.body.appendChild(iconInput);
    iconInput.addEventListener("change", () => {
      const file = iconInput.files && iconInput.files[0];
      if (!file) return;
      if (file.size > ICON_WARN_BYTES) {
        const mb = (file.size / (1024 * 1024)).toFixed(1);
        const proceed = confirm(
          `画像サイズが${mb}MBある。アイコンは小さく表示されるだけなので、もっと軽い画像の方がおすすめ。それでも設定を試す？`
        );
        if (!proceed) {
          iconInput.value = "";
          return;
        }
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (!saveCustomIcon(reader.result)) {
          alert("画像が大きすぎて保存できなかった。もう少し軽い画像を試して。");
          return;
        }
        applyCustomIcon(reader.result);
        refreshHeaderIconModal();
      };
      reader.readAsDataURL(file);
    });
  }

  function buildTabBar() {
    return `
      <div class="hi-tabs">
        <button class="hi-tab ${modalTab === "display" ? "active" : ""}" data-hi-tab="display">表示</button>
        <button class="hi-tab ${modalTab === "glossary" ? "active" : ""}" data-hi-tab="glossary">用語</button>
      </div>`;
  }

  function buildDisplayTabContent() {
    const settings = loadSettings();
    const hasWallpaper = !!settings.image;
    const hasCustomIcon = !!loadCustomIcon();

    return `
      <button class="hi-choice" id="hi-choice-wallpaper">${window.icon ? window.icon("image") : ""}${hasWallpaper ? "壁紙を変更" : "壁紙を設定"}</button>
      ${
        hasWallpaper
          ? `
        <div class="hi-sub">
          <button class="hi-choice" id="hi-position-btn">位置を調整</button>
          <button class="hi-choice hi-reset" id="hi-wallpaper-reset">${window.icon ? window.icon("x") : ""}壁紙をリセット</button>
        </div>`
          : ""
      }
      <button class="hi-choice" id="hi-choice-icon"><img src="/favicon.svg" alt="" style="width:16px;height:16px;">${hasCustomIcon ? "アイコンを変更" : "アイコンを設定"}</button>
      ${hasCustomIcon ? `<button class="hi-choice hi-reset" id="hi-icon-reset">${window.icon ? window.icon("x") : ""}アイコンをリセット</button>` : ""}
      <label class="hi-field hi-blur-row" title="パネルのぼかし強さ（下げるほど壁紙が透けて見える）">
        ぼかし
        <input type="range" id="hi-blur-slider" min="${BLUR_MIN}" max="${BLUR_MAX}" step="1" value="${settings.blur}">
        <span id="hi-blur-value">${settings.blur}px</span>
      </label>
      <p class="hi-hint">画像サイズの目安: 壁紙は${Math.round(WARN_BYTES / 1024 / 1024)}MBまで、アイコンは${Math.round(ICON_WARN_BYTES / 1024 / 1024)}MBまで（超えると保存に失敗しやすい）</p>
    `;
  }

  // 用語マッピング（pkg/glossary）タブ。Rivenステータス名等の英→日対応をカテゴリ別に一覧し、
  // 日本語欄はその場編集（blurで保存）、新規追加は下部の簡易フォームから行う。
  function buildGlossaryTabContent() {
    if (!glossaryCache) {
      fetchGlossary();
      return `<p class="hi-hint">読み込み中…</p>`;
    }
    const entries = Object.values(glossaryCache.entries || {}).sort((a, b) =>
      a.category === b.category ? a.enKey.localeCompare(b.enKey) : a.category.localeCompare(b.category)
    );
    const byCategory = {};
    entries.forEach((e) => { (byCategory[e.category] || (byCategory[e.category] = [])).push(e); });

    const sections = Object.keys(byCategory).sort().map((cat) => `
        <div class="hi-glossary-cat-title">${escapeHtml(cat)}</div>
        <table class="hi-glossary-table">
          ${byCategory[cat].map((e) => `
            <tr>
              <td class="hi-glossary-en" title="${escapeHtml(e.enKey)}">${escapeHtml(e.enKey)}</td>
              <td><input type="text" class="hi-glossary-ja-input" data-glossary-key="${escapeHtml(e.enKey)}" data-glossary-cat="${escapeHtml(e.category)}" value="${escapeHtml(e.ja)}"></td>
              <td><button class="hi-choice hi-reset hi-glossary-del" data-glossary-del="${escapeHtml(e.enKey)}" title="削除">${window.icon ? window.icon("x") : ""}</button></td>
            </tr>`).join("")}
        </table>`).join("") || `<p class="hi-hint">用語がまだ登録されていません</p>`;

    return `
      <p class="hi-hint">ゲーム内用語の英→日対応。日本語欄を編集するとその場で保存される。</p>
      ${sections}
      <div class="hi-glossary-add">
        <input type="text" id="hi-glossary-new-en" placeholder="英語キー">
        <input type="text" id="hi-glossary-new-ja" placeholder="日本語表記">
        <input type="text" id="hi-glossary-new-cat" placeholder="カテゴリ" value="Riven">
        <button class="hi-choice" id="hi-glossary-add-btn">${window.icon ? window.icon("plus") : ""}追加</button>
      </div>
    `;
  }

  function buildModalContent() {
    const title = modalTab === "glossary" ? "用語マッピング" : "壁紙 / アイコン";
    const body = modalTab === "glossary" ? buildGlossaryTabContent() : buildDisplayTabContent();
    return `
      <h3>${title}</h3>
      ${buildTabBar()}
      ${body}
      <div class="hi-cancel-row"><button id="hi-cancel">閉じる</button></div>
    `;
  }

  function wireGlossaryTabContent(box) {
    box.querySelectorAll(".hi-glossary-ja-input").forEach((input) => {
      input.addEventListener("blur", () => {
        const ja = input.value.trim();
        if (!ja) return; // 空欄での上書きは事故りやすいので無視（削除はボタンで明示的に行う）
        saveGlossaryEntry({ enKey: input.dataset.glossaryKey, ja, category: input.dataset.glossaryCat });
      });
    });
    box.querySelectorAll(".hi-glossary-del").forEach((btn) => {
      btn.addEventListener("click", () => deleteGlossaryEntry(btn.dataset.glossaryDel));
    });
    const addBtn = box.querySelector("#hi-glossary-add-btn");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        const enKey = box.querySelector("#hi-glossary-new-en").value.trim();
        const ja = box.querySelector("#hi-glossary-new-ja").value.trim();
        const category = box.querySelector("#hi-glossary-new-cat").value.trim() || "General";
        if (!enKey || !ja) { alert("英語キーと日本語表記を入力して"); return; }
        saveGlossaryEntry({ enKey, ja, category });
      });
    }
  }

  function wireModalContent(box) {
    box.querySelector("#hi-cancel").addEventListener("click", closeHeaderIconModal);
    box.querySelectorAll("[data-hi-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        modalTab = btn.dataset.hiTab;
        refreshHeaderIconModal();
      });
    });
    if (modalTab === "glossary") {
      wireGlossaryTabContent(box);
      return;
    }
    box.querySelector("#hi-choice-wallpaper").addEventListener("click", () => {
      document.getElementById("wallpaper-input").click();
    });
    box.querySelector("#hi-choice-icon").addEventListener("click", () => {
      document.getElementById("icon-input").click();
    });

    const positionBtn = box.querySelector("#hi-position-btn");
    if (positionBtn) {
      positionBtn.addEventListener("click", () => {
        openPositionModal(loadSettings(), (x, y) => {
          const next = { ...loadSettings(), posX: x, posY: y };
          saveSettings(next);
          applyWallpaper(next);
          refreshHeaderIconModal();
        });
      });
    }

    const wallpaperResetBtn = box.querySelector("#hi-wallpaper-reset");
    if (wallpaperResetBtn) {
      wallpaperResetBtn.addEventListener("click", () => {
        // ぼかし設定は壁紙とは独立した好みなので、壁紙リセット時も維持する。
        const next = { ...DEFAULT_SETTINGS, blur: loadSettings().blur };
        saveSettings(next);
        applyWallpaper(next);
        refreshHeaderIconModal();
      });
    }

    const iconResetBtn = box.querySelector("#hi-icon-reset");
    if (iconResetBtn) {
      iconResetBtn.addEventListener("click", () => {
        saveCustomIcon(null);
        applyCustomIcon(null);
        refreshHeaderIconModal();
      });
    }

    // ぼかしスライダー: ドラッグ中はライブ反映するだけでモーダルは作り直さない
    // （作り直すとスライダーごとDOMが差し替わりドラッグが中断してしまうため）。
    const blurSlider = box.querySelector("#hi-blur-slider");
    const blurValueLabel = box.querySelector("#hi-blur-value");
    blurSlider.addEventListener("input", () => {
      const px = Number(blurSlider.value);
      blurValueLabel.textContent = `${px}px`;
      applyPanelBlur(px);
    });
    blurSlider.addEventListener("change", () => {
      const next = { ...loadSettings(), blur: Number(blurSlider.value) };
      saveSettings(next);
    });
  }

  // モーダルが開いている間に状態が変わった時（画像選択・サイズ変更・リセット等）に
  // 中身だけを再描画する。閉じている間は何もしない。
  function refreshHeaderIconModal() {
    const box = document.querySelector("#header-icon-modal .hi-box");
    if (!box) return;
    box.innerHTML = buildModalContent();
    wireModalContent(box);
  }

  function closeHeaderIconModal() {
    const el = document.getElementById("header-icon-modal");
    if (el) el.remove();
  }

  function openHeaderIconChoiceModal() {
    closeHeaderIconModal();
    const overlay = document.createElement("div");
    overlay.id = "header-icon-modal";
    overlay.innerHTML = `<div class="hi-box">${buildModalContent()}</div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeHeaderIconModal();
    });
    wireModalContent(overlay.querySelector(".hi-box"));
  }

  function openPositionModal(settings, onConfirm) {
    const overlay = document.createElement("div");
    overlay.id = "wallpaper-position-modal";
    overlay.innerHTML = `
      <div class="wp-box">
        <h3>壁紙の位置を調整</h3>
        <p class="wp-hint">枠内で画像をドラッグして、見せたい部分を決める。</p>
        <div class="wp-frame">
          <img id="wp-drag-img" src="${settings.image}" style="object-fit:cover;object-position:${settings.posX}% ${settings.posY}%;">
        </div>
        <div class="wp-buttons">
          <button id="wp-cancel">キャンセル</button>
          <button id="wp-confirm">確定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const frame = overlay.querySelector(".wp-frame");
    const img = overlay.querySelector("#wp-drag-img");
    let pos = { x: settings.posX, y: settings.posY };
    let dragging = false;
    let last = { x: 0, y: 0 };

    frame.addEventListener("pointerdown", (e) => {
      dragging = true;
      frame.classList.add("dragging");
      frame.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
    });
    frame.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const rect = frame.getBoundingClientRect();
      const dx = e.clientX - last.x;
      const dy = e.clientY - last.y;
      last = { x: e.clientX, y: e.clientY };
      // 画像自体を掴んでドラッグする直感に合わせ、右へ引きずるほど見える範囲は画像の左側へ動く
      // （= object-position/background-positionのパーセントは減る）向きにする。
      pos.x = Math.min(100, Math.max(0, pos.x - (dx / rect.width) * 100));
      pos.y = Math.min(100, Math.max(0, pos.y - (dy / rect.height) * 100));
      img.style.objectPosition = `${pos.x}% ${pos.y}%`;
    });
    const endDrag = (e) => {
      if (!dragging) return;
      dragging = false;
      frame.classList.remove("dragging");
      if (e && frame.hasPointerCapture && frame.hasPointerCapture(e.pointerId)) {
        frame.releasePointerCapture(e.pointerId);
      }
    };
    frame.addEventListener("pointerup", endDrag);
    frame.addEventListener("pointercancel", endDrag);

    overlay.querySelector("#wp-cancel").addEventListener("click", () => overlay.remove());
    overlay.querySelector("#wp-confirm").addEventListener("click", () => {
      onConfirm(pos.x, pos.y);
      overlay.remove();
    });
  }

  // ヘッダーのアプリアイコン（.app-icon）をクリックすると、壁紙/アイコン/ぼかしをまとめて
  // 操作できる中央モーダルを開く。以前は左下に常時表示のウィジェットも別途あったが、
  // 「ヘッダーアイコンのポップアップにしまえる？」の指定（2026-08-18）で統合し廃止した。
  function bindHeaderIconEasterEgg() {
    const headerIcon = document.querySelector(".app-icon");
    if (!headerIcon) return;
    headerIcon.style.cursor = "pointer";
    headerIcon.title = "クリックして壁紙/アイコン/ぼかしを変更";
    headerIcon.addEventListener("click", openHeaderIconChoiceModal);
  }

  injectStyle();
  createHiddenInputs();
  const initialSettings = loadSettings();
  applyWallpaper(initialSettings);
  applyPanelBlur(initialSettings.blur);
  applyCustomIcon(loadCustomIcon());
  bindHeaderIconEasterEgg();
})();
