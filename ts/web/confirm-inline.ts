// Shared inline confirmation popover (ADR05 — 05_ADR_Native_Dialog_Migration.md,
// Proposed 2026-08-26, implemented 2026-08-28 のっち依頼「全部モーダルに」).
// Replaces window.confirm() across the app — the ADR's own trigger incident
// was a confirm() dialog freezing a browser-automation tab solid, unrecoverable
// short of closing the tab.
//
// confirmInline(anchor, message) returns a Promise<boolean>, so
// `if (await confirmInline(btn, "message"))` is a near-drop-in replacement
// for `if (confirm("message"))` at every call site. Positioned via
// getBoundingClientRect() from the triggering button (position:fixed — see
// build-sidebar.ts's #sb-move-popover for why a plain absolute-positioned
// popover risks getting clipped by a scrolling/blurred ancestor; this one
// is appended straight to <body> so that concern doesn't even apply here).
let activePopover: HTMLElement | null = null;
let activeResolve: ((v: boolean) => void) | null = null;

function closeActive(result: boolean): void {
  const resolve = activeResolve;
  activePopover?.remove();
  activePopover = null;
  activeResolve = null;
  resolve?.(result);
}

/** okLabel defaults to "削除" since every current call site is a delete
 * confirmation; pass an explicit label for any other kind of destructive
 * confirm. */
export function confirmInline(anchor: HTMLElement, message: string, okLabel = "削除"): Promise<boolean> {
  closeActive(false); // 前のが開いていたら閉じる（同時に1つだけ）

  function onOutsideClick(): void {
    document.removeEventListener("click", onOutsideClick);
    closeActive(false);
  }

  return new Promise((resolve) => {
    const pop = document.createElement("div");
    pop.className = "confirm-inline";
    pop.innerHTML = `
      <div>${message}</div>
      <div class="actions">
        <button class="toggle" data-confirm-cancel>キャンセル</button>
        <button class="toggle confirm-inline-ok" data-confirm-ok>${okLabel}</button>
      </div>`;
    document.body.appendChild(pop);

    const rect = anchor.getBoundingClientRect();
    const popRect = pop.getBoundingClientRect();
    let left = rect.left;
    if (left + popRect.width > window.innerWidth) left = window.innerWidth - popRect.width - 8;
    // position:fixedはビューポート基準で、topはここで一度決めたら以後動かない
    // （スクロールしても追従しない）。下に置くと画面外にはみ出す場合はボタン
    // 行ごと見えなくなり「削除ボタンが効かない」に見える不具合として報告
    // された（2026-08-29、Loadoutsの一番下のカードで再現）——showFlyout()
    // （graph-nav.ts）と同じ「下に入らなければ上に反転」を適用する。
    let top = rect.bottom + 6;
    if (top + popRect.height > window.innerHeight) top = rect.top - popRect.height - 6;
    pop.style.top = `${Math.max(8, top)}px`;
    pop.style.left = `${Math.max(8, left)}px`;

    activePopover = pop;
    activeResolve = resolve;

    pop.querySelector("[data-confirm-ok]")!.addEventListener("click", (e) => {
      e.stopPropagation();
      closeActive(true);
    });
    pop.querySelector("[data-confirm-cancel]")!.addEventListener("click", (e) => {
      e.stopPropagation();
      closeActive(false);
    });
    pop.addEventListener("click", (e) => e.stopPropagation());
    // 外側クリックでキャンセル扱い。開いた瞬間の同一クリックイベントで即座に
    // 閉じてしまわないよう、次のタスクまでリスナー登録を遅延させる
    // （anchorクリック自体がdocumentまでバブリングするのを1回だけ避ける）。
    setTimeout(() => document.addEventListener("click", onOutsideClick), 0);
  });
}
