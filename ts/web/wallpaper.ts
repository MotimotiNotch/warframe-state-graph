// Port of web/wallpaper.js. Background wallpaper (localStorage data URL,
// no server-side storage) plus the header-icon modal that bundles
// wallpaper/custom-icon/panel-blur controls and the glossary "用語" tab
// editor together (settled 2026-08-18: one modal instead of a separate
// always-visible bottom-left widget).
//
// Not yet wired into the bundled-JS routing (`/wallpaper.js` still serves
// the original, unported web/wallpaper.js via the server's legacy static
// passthrough) because loadouts.html/collections.html/stats.html — not
// ported yet — still load it as a plain classic `<script src>`, and an ESM
// bundle's `export` syntax would be a SyntaxError there. This module exists
// now so it's ready as soon as those pages are ported; the `/wallpaper.js`
// route itself cuts over once every consuming page has moved to
// `type="module"` script tags. The glossary "用語" tab specifically is meant
// to live on collections.html (see server/glossary.ts's header comment,
// Phase 10) — it's ported here now as part of the whole modal, not split out.
import { icon } from "./icons.ts";
import type { Data as GlossaryData, Entry as GlossaryEntry } from "../server/glossary.ts";

const STORAGE_KEY = "warframe-state-graph:wallpaper";
const OPACITY = 0.28;
const WARN_BYTES = 3 * 1024 * 1024;

const ICON_STORAGE_KEY = "warframe-state-graph:custom-icon";
const ICON_WARN_BYTES = 1 * 1024 * 1024;
const DEFAULT_ICON_SRC = "/favicon.svg";

interface Settings {
  image: string | null;
  posX: number;
  posY: number;
  blur: number;
}

const DEFAULT_SETTINGS: Settings = { image: null, posX: 50, posY: 50, blur: 5 };
const BLUR_MIN = 0;
const BLUR_MAX = 24;

type ModalTab = "display" | "glossary";
let modalTab: ModalTab = "display";
let glossaryCache: GlossaryData | null = null;

function escapeHtml(s: unknown): string {
  const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  return String(s ?? "").replace(/[&<>"']/g, (c) => map[c] ?? c);
}

async function fetchGlossary(): Promise<void> {
  try {
    const res = await fetch("/api/glossary");
    glossaryCache = res.ok ? ((await res.json()) as GlossaryData) : { schemaVersion: 1, entries: {} };
  } catch {
    glossaryCache = { schemaVersion: 1, entries: {} };
  }
  refreshHeaderIconModal();
}

async function saveGlossaryEntry(entry: GlossaryEntry): Promise<void> {
  const res = await fetch("/api/glossary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(entry),
  });
  if (res.ok) glossaryCache = (await res.json()) as GlossaryData;
  refreshHeaderIconModal();
}

async function deleteGlossaryEntry(enKey: string): Promise<void> {
  const res = await fetch(`/api/glossary/${encodeURIComponent(enKey)}`, { method: "DELETE" });
  if (res.ok) glossaryCache = (await res.json()) as GlossaryData;
  refreshHeaderIconModal();
}

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings(settings: Settings): boolean {
  try {
    // blur has meaning even without an image, so the storage key is never
    // dropped just because image is unset (a past bug: no-image used to
    // wipe the whole key).
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    return true;
  } catch {
    return false; // localStorage quota exceeded (image too large), etc.
  }
}

function applyPanelBlur(px: number): void {
  const clamped = Math.min(BLUR_MAX, Math.max(BLUR_MIN, Number(px) || 0));
  document.documentElement.style.setProperty("--panel-blur", `${clamped}px`);
}

function loadCustomIcon(): string | null {
  try {
    return localStorage.getItem(ICON_STORAGE_KEY);
  } catch {
    return null;
  }
}

function saveCustomIcon(dataUrl: string | null): boolean {
  try {
    if (dataUrl) localStorage.setItem(ICON_STORAGE_KEY, dataUrl);
    else localStorage.removeItem(ICON_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function applyCustomIcon(dataUrl: string | null): void {
  const src = dataUrl || DEFAULT_ICON_SRC;
  document.querySelectorAll<HTMLImageElement>(".app-icon").forEach((img) => {
    img.src = src;
  });
  const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (link) {
    link.href = src;
    if (dataUrl) {
      // A mismatched declared type vs. the data URL's real MIME type gets
      // ignored by some browsers, so drop `type` and let the browser sniff it.
      link.removeAttribute("type");
    } else {
      link.setAttribute("type", "image/svg+xml");
    }
  }
}

function applyWallpaper(settings: Settings): void {
  if (settings.image) {
    // A multi-MB data URL silently gets dropped by Chromium when set on a
    // CSS custom property (--wallpaper-image) — getPropertyValue reads back
    // empty, no error. The native background-image longhand tolerates the
    // same size fine (verified live, 2026-08-22), so it's set directly here
    // instead of going through a CSS variable.
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

function injectStyle(): void {
  const style = document.createElement("style");
  style.textContent = `
      body.has-wallpaper {
        /* background-image is set inline by applyWallpaper() (a CSS variable
           would silently drop large data URLs). Only position/size etc. here. */
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
        /* モーダルは背後が透けると読みにくいので、半透明の--panelでなく
           ほぼ不透明の--popover-bgを使う（popover-opacityルールと同じ理由）。 */
        background: var(--popover-bg, rgba(20, 22, 28, 0.94));
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
        /* モーダルは背後が透けると読みにくいので、半透明の--panelでなく
           ほぼ不透明の--popover-bgを使う（popover-opacityルールと同じ理由）。 */
        background: var(--popover-bg, rgba(20, 22, 28, 0.94));
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

// Two hidden file inputs (wallpaper/icon), created once outside the modal.
// The modal's DOM is rebuilt on every open/close, so keeping the inputs
// inside it would make the native file-picker dialog's behavior unstable if
// the modal closes while it's open — they live outside for a stable reference.
function createHiddenInputs(): void {
  const wallpaperInput = document.createElement("input");
  wallpaperInput.type = "file";
  wallpaperInput.id = "wallpaper-input";
  wallpaperInput.accept = "image/*";
  wallpaperInput.style.display = "none";
  document.body.appendChild(wallpaperInput);
  wallpaperInput.addEventListener("change", () => {
    const file = wallpaperInput.files?.[0];
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
      // Position resets to center on every new image, then the position
      // modal opens immediately (auto-transition instead of a separate
      // "adjust position" click, 2026-08-18).
      const next: Settings = { ...loadSettings(), image: reader.result as string, posX: 50, posY: 50 };
      if (!saveSettings(next)) {
        alert("画像が大きすぎて保存できなかった。もう少し軽い画像を試して。");
        return;
      }
      applyWallpaper(next);
      refreshHeaderIconModal();
      openPositionModal(next, (x, y) => {
        const withPos: Settings = { ...next, posX: x, posY: y };
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
    const file = iconInput.files?.[0];
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
      const dataUrl = reader.result as string;
      if (!saveCustomIcon(dataUrl)) {
        alert("画像が大きすぎて保存できなかった。もう少し軽い画像を試して。");
        return;
      }
      applyCustomIcon(dataUrl);
      refreshHeaderIconModal();
    };
    reader.readAsDataURL(file);
  });
}

function buildTabBar(): string {
  return `
      <div class="hi-tabs">
        <button class="hi-tab ${modalTab === "display" ? "active" : ""}" data-hi-tab="display">表示</button>
        <button class="hi-tab ${modalTab === "glossary" ? "active" : ""}" data-hi-tab="glossary">用語</button>
      </div>`;
}

function buildDisplayTabContent(): string {
  const settings = loadSettings();
  const hasWallpaper = !!settings.image;
  const hasCustomIcon = !!loadCustomIcon();

  return `
      <button class="hi-choice" id="hi-choice-wallpaper">${icon("image")}${hasWallpaper ? "壁紙を変更" : "壁紙を設定"}</button>
      ${
        hasWallpaper
          ? `
        <div class="hi-sub">
          <button class="hi-choice" id="hi-position-btn">位置を調整</button>
          <button class="hi-choice hi-reset" id="hi-wallpaper-reset">${icon("x")}壁紙をリセット</button>
        </div>`
          : ""
      }
      <button class="hi-choice" id="hi-choice-icon"><img src="/favicon.svg" alt="" style="width:16px;height:16px;">${hasCustomIcon ? "アイコンを変更" : "アイコンを設定"}</button>
      ${hasCustomIcon ? `<button class="hi-choice hi-reset" id="hi-icon-reset">${icon("x")}アイコンをリセット</button>` : ""}
      <label class="hi-field hi-blur-row" title="パネルのぼかし強さ（下げるほど壁紙が透けて見える）">
        ぼかし
        <input type="range" id="hi-blur-slider" min="${BLUR_MIN}" max="${BLUR_MAX}" step="1" value="${settings.blur}">
        <span id="hi-blur-value">${settings.blur}px</span>
      </label>
      <p class="hi-hint">画像サイズの目安: 壁紙は${Math.round(WARN_BYTES / 1024 / 1024)}MBまで、アイコンは${Math.round(ICON_WARN_BYTES / 1024 / 1024)}MBまで（超えると保存に失敗しやすい）</p>
    `;
}

// Glossary (pkg/glossary) tab: en->ja mappings (Riven stat names etc.)
// listed by category, ja cell editable in place (saved on blur), new
// entries added from the bottom mini-form.
function buildGlossaryTabContent(): string {
  if (!glossaryCache) {
    void fetchGlossary();
    return `<p class="hi-hint">読み込み中…</p>`;
  }
  const entries = Object.values(glossaryCache.entries).sort((a, b) =>
    a.category === b.category ? a.enKey.localeCompare(b.enKey) : a.category.localeCompare(b.category)
  );
  const byCategory: Record<string, GlossaryEntry[]> = {};
  entries.forEach((e) => {
    (byCategory[e.category] ??= []).push(e);
  });

  const sections =
    Object.keys(byCategory)
      .sort()
      .map(
        (cat) => `
        <div class="hi-glossary-cat-title">${escapeHtml(cat)}</div>
        <table class="hi-glossary-table">
          ${(byCategory[cat] ?? [])
            .map(
              (e) => `
            <tr>
              <td class="hi-glossary-en" title="${escapeHtml(e.enKey)}">${escapeHtml(e.enKey)}</td>
              <td><input type="text" class="hi-glossary-ja-input" data-glossary-key="${escapeHtml(e.enKey)}" data-glossary-cat="${escapeHtml(e.category)}" value="${escapeHtml(e.ja)}"></td>
              <td><button class="hi-choice hi-reset hi-glossary-del" data-glossary-del="${escapeHtml(e.enKey)}" title="削除">${icon("x")}</button></td>
            </tr>`
            )
            .join("")}
        </table>`
      )
      .join("") || `<p class="hi-hint">用語がまだ登録されていません</p>`;

  return `
      <p class="hi-hint">ゲーム内用語の英→日対応。日本語欄を編集するとその場で保存される。</p>
      ${sections}
      <div class="hi-glossary-add">
        <input type="text" id="hi-glossary-new-en" placeholder="英語キー">
        <input type="text" id="hi-glossary-new-ja" placeholder="日本語表記">
        <input type="text" id="hi-glossary-new-cat" placeholder="カテゴリ" value="Riven">
        <button class="hi-choice" id="hi-glossary-add-btn">${icon("plus")}追加</button>
      </div>
    `;
}

function buildModalContent(): string {
  const title = modalTab === "glossary" ? "用語マッピング" : "壁紙 / アイコン";
  const body = modalTab === "glossary" ? buildGlossaryTabContent() : buildDisplayTabContent();
  return `
      <h3>${title}</h3>
      ${buildTabBar()}
      ${body}
      <div class="hi-cancel-row"><button id="hi-cancel">閉じる</button></div>
    `;
}

function wireGlossaryTabContent(box: Element): void {
  box.querySelectorAll<HTMLInputElement>(".hi-glossary-ja-input").forEach((input) => {
    input.addEventListener("blur", () => {
      const ja = input.value.trim();
      if (!ja) return; // an empty overwrite is accident-prone; deletion is an explicit button instead
      const enKey = input.dataset.glossaryKey ?? "";
      const category = input.dataset.glossaryCat ?? "";
      void saveGlossaryEntry({ enKey, ja, category });
    });
  });
  box.querySelectorAll<HTMLButtonElement>(".hi-glossary-del").forEach((btn) => {
    btn.addEventListener("click", () => void deleteGlossaryEntry(btn.dataset.glossaryDel ?? ""));
  });
  const addBtn = box.querySelector<HTMLButtonElement>("#hi-glossary-add-btn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const enKey = box.querySelector<HTMLInputElement>("#hi-glossary-new-en")!.value.trim();
      const ja = box.querySelector<HTMLInputElement>("#hi-glossary-new-ja")!.value.trim();
      const category = box.querySelector<HTMLInputElement>("#hi-glossary-new-cat")!.value.trim() || "General";
      if (!enKey || !ja) {
        alert("英語キーと日本語表記を入力して");
        return;
      }
      void saveGlossaryEntry({ enKey, ja, category });
    });
  }
}

function wireModalContent(box: Element): void {
  box.querySelector("#hi-cancel")!.addEventListener("click", closeHeaderIconModal);
  box.querySelectorAll<HTMLButtonElement>("[data-hi-tab]").forEach((btn) => {
    btn.addEventListener("click", () => {
      modalTab = (btn.dataset.hiTab as ModalTab) ?? "display";
      refreshHeaderIconModal();
    });
  });
  if (modalTab === "glossary") {
    wireGlossaryTabContent(box);
    return;
  }
  box.querySelector("#hi-choice-wallpaper")!.addEventListener("click", () => {
    document.getElementById("wallpaper-input")!.click();
  });
  box.querySelector("#hi-choice-icon")!.addEventListener("click", () => {
    document.getElementById("icon-input")!.click();
  });

  const positionBtn = box.querySelector("#hi-position-btn");
  if (positionBtn) {
    positionBtn.addEventListener("click", () => {
      openPositionModal(loadSettings(), (x, y) => {
        const next: Settings = { ...loadSettings(), posX: x, posY: y };
        saveSettings(next);
        applyWallpaper(next);
        refreshHeaderIconModal();
      });
    });
  }

  const wallpaperResetBtn = box.querySelector("#hi-wallpaper-reset");
  if (wallpaperResetBtn) {
    wallpaperResetBtn.addEventListener("click", () => {
      // Blur is a preference independent of the wallpaper, so it survives a wallpaper reset.
      const next: Settings = { ...DEFAULT_SETTINGS, blur: loadSettings().blur };
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

  // Blur slider: live-apply while dragging without rebuilding the modal
  // (rebuilding would swap out the slider's DOM mid-drag and interrupt it).
  const blurSlider = box.querySelector<HTMLInputElement>("#hi-blur-slider")!;
  const blurValueLabel = box.querySelector<HTMLElement>("#hi-blur-value")!;
  blurSlider.addEventListener("input", () => {
    const px = Number(blurSlider.value);
    blurValueLabel.textContent = `${px}px`;
    applyPanelBlur(px);
  });
  blurSlider.addEventListener("change", () => {
    const next: Settings = { ...loadSettings(), blur: Number(blurSlider.value) };
    saveSettings(next);
  });
}

// Re-renders just the modal body when state changes while it's open (image
// picked, size changed, reset, ...). No-op while the modal is closed.
function refreshHeaderIconModal(): void {
  const box = document.querySelector("#header-icon-modal .hi-box");
  if (!box) return;
  box.innerHTML = buildModalContent();
  wireModalContent(box);
}

function closeHeaderIconModal(): void {
  document.getElementById("header-icon-modal")?.remove();
}

function openHeaderIconChoiceModal(): void {
  closeHeaderIconModal();
  const overlay = document.createElement("div");
  overlay.id = "header-icon-modal";
  overlay.innerHTML = `<div class="hi-box">${buildModalContent()}</div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeHeaderIconModal();
  });
  wireModalContent(overlay.querySelector(".hi-box")!);
}

function openPositionModal(settings: Settings, onConfirm: (x: number, y: number) => void): void {
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

  const frame = overlay.querySelector<HTMLElement>(".wp-frame")!;
  const img = overlay.querySelector<HTMLImageElement>("#wp-drag-img")!;
  const pos = { x: settings.posX, y: settings.posY };
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
    // Dragging the image itself is the intuition, so dragging right moves
    // the visible window toward the image's left (the position % decreases).
    pos.x = Math.min(100, Math.max(0, pos.x - (dx / rect.width) * 100));
    pos.y = Math.min(100, Math.max(0, pos.y - (dy / rect.height) * 100));
    img.style.objectPosition = `${pos.x}% ${pos.y}%`;
  });
  const endDrag = (e?: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    frame.classList.remove("dragging");
    if (e && frame.hasPointerCapture(e.pointerId)) {
      frame.releasePointerCapture(e.pointerId);
    }
  };
  frame.addEventListener("pointerup", endDrag);
  frame.addEventListener("pointercancel", endDrag);

  overlay.querySelector("#wp-cancel")!.addEventListener("click", () => overlay.remove());
  overlay.querySelector("#wp-confirm")!.addEventListener("click", () => {
    onConfirm(pos.x, pos.y);
    overlay.remove();
  });
}

// Clicking the header app icon (.app-icon) opens the central modal bundling
// wallpaper/icon/blur controls (settled 2026-08-18, replacing a separate
// always-visible bottom-left widget).
function bindHeaderIconEasterEgg(): void {
  const headerIcon = document.querySelector<HTMLElement>(".app-icon");
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
