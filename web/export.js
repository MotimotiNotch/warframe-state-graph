// カード内容（フレーム/武器/コンパニオン名・MODコンフィグ・メモ）を人が読める
// プレーンテキストに変換し、クリップボードにコピーする。友達へのビルド共有や
// AIへの相談用途を想定した軽量エクスポート機能（2026-08-20設計）。
(function () {
  function buildItemExportText(item) {
    const lines = [`${item.name} (${item.type})`];
    const slots = item.type === "Companion" ? ["A"] : ["A", "B", "C"];
    slots.forEach((slot) => {
      const mods = (item.configs && item.configs[slot]) || [];
      if (!mods.length) return;
      lines.push("", `[Config ${slot}]`, ...mods.map((m) => `- ${m}`));
    });
    if (item.note) {
      lines.push("", "Note:", item.note);
    }
    return lines.join("\n");
  }

  // items: state.data.items（id -> Item）。Frame/Weapons参照を名前+MODへ解決する。
  function buildBuildSetExportText(set, items) {
    const resolve = (ref) => {
      const item = items[ref.itemId];
      if (!item) return `(不明なアイテム: ${ref.itemId})`;
      const mods = item.configs?.[ref.config] || [];
      return `${item.name}（Config ${ref.config}: ${mods.length ? mods.join(", ") : "MODなし"}）`;
    };
    const lines = [`${set.name} (Build Set)`];
    if (set.frame) lines.push("", `Frame: ${resolve(set.frame)}`);
    if ((set.weapons || []).length) {
      lines.push("", "Weapons:", ...set.weapons.map((w) => `- ${resolve(w)}`));
    }
    if (set.note) lines.push("", "Note:", set.note);
    return lines.join("\n");
  }

  // statKey1件を「ステータス名 +数値%」の表示テキストに整形する。value が無い/0の場合は
  // 数値部分を省く（未入力のRivenでも壊れず表示できるようにするため）。
  // jaFn: ステータスキーを日本語化する関数（省略時は生のキーのまま）。
  function formatRivenStat(statKey, value, jaFn) {
    const label = (jaFn || ((s) => s))(statKey);
    if (!value) return label;
    const sign = value > 0 ? "+" : ""; // 負の値はvalue自体に"-"が乗っているので符号を追加しない
    return `${label} ${sign}${value}%`;
  }

  // jaFn(statKey): Rivenステータス名を日本語化する関数（呼び出し側のcollections.htmlが持つ
  // `ja()`を渡す想定、省略時は生のキーのまま）。UI表示と同じ見た目でコピーされるようにする。
  function buildRivenExportText(entry, jaFn) {
    const lines = [`${entry.weaponName} (Riven)`];
    if ((entry.positiveStats || []).length) {
      const values = entry.positiveValues || [];
      lines.push(`Positive: ${entry.positiveStats.map((s, i) => formatRivenStat(s, values[i], jaFn)).join(", ")}`);
    }
    if (entry.negativeStat) lines.push(`Negative: ${formatRivenStat(entry.negativeStat, entry.negativeValue, jaFn)}`);
    lines.push(`状態: ${entry.fixed ? "FIX済み" : "要リロール"}`);
    if (entry.note) lines.push("", "Note:", entry.note);
    return lines.join("\n");
  }

  function buildKuvaExportText(entry) {
    const lines = [`${entry.weaponName} (${entry.kind || "Kuva"})`];
    lines.push(`所持: ${entry.owned ? "済み" : "未所持"}`);
    if (entry.bonusStat) lines.push(`ボーナス属性: ${entry.bonusStat}`);
    if (entry.note) lines.push("", "Note:", entry.note);
    return lines.join("\n");
  }

  // Collections.FrameEntry（フレーム入手状況）用。Loadouts.ItemのbuildItemExportTextとは別物。
  function buildFrameEntryExportText(entry) {
    const lines = [`${entry.name} (Frame)`];
    lines.push(`入手: ${entry.owned ? "済み" : "未入手"}`);
    lines.push(`ランク30: ${entry.rankedThirty ? "済み" : "未"}`);
    lines.push(`ヘルミンス: ${entry.helminthFed ? "済み" : "未"}`);
    if (entry.note) lines.push("", "Note:", entry.note);
    return lines.join("\n");
  }

  // Collections.IncarnonEntry（デュビリ・インカーノン進捗）用（2026-08-22、DuviriDataの
  // 集計方式から登録制へ移行した際に追加）。
  function buildIncarnonExportText(entry) {
    const lines = [`${entry.weaponName} (Incarnon)`];
    lines.push(`取得: ${entry.obtained ? "済み" : "未取得"}`);
    lines.push(`インカーノン: ${entry.completed ? "済み" : "未"}`);
    if (entry.note) lines.push("", "Note:", entry.note);
    return lines.join("\n");
  }

  // ボタンのクリックハンドラから直接（awaitを挟まず）呼ばれる想定。
  // navigator.clipboard.writeText はクリックのtransient user activationが
  // 必要なため、間に別の非同期処理を挟むと失効することに注意。
  function copyTextToClipboard(text) {
    return navigator.clipboard.writeText(text);
  }

  // root配下のselectorに一致するコピー用ボタン全てに、成功/失敗の共通フィードバック
  // （成功: .copied を一瞬付与、失敗: .danger + titleにエラー文言を一時表示）を配線する。
  // textFn(btn): クリックされたボタン要素からエクスポートテキストを組み立てて返す関数。
  function wireCopyButtons(root, selector, textFn) {
    root.querySelectorAll(selector).forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // カード全体クリックでモーダルを開く実装（Riven等）への誤伝播防止
        const originalTitle = btn.title;
        copyTextToClipboard(textFn(btn)).then(() => {
          btn.classList.add("copied");
          setTimeout(() => btn.classList.remove("copied"), 1200);
        }).catch((e) => {
          console.warn("クリップボードへのコピーに失敗", e);
          btn.classList.add("danger");
          btn.title = "コピーに失敗しました（もう一度お試しください）";
          setTimeout(() => { btn.classList.remove("danger"); btn.title = originalTitle; }, 2000);
        });
      });
    });
  }

  window.buildItemExportText = buildItemExportText;
  window.buildBuildSetExportText = buildBuildSetExportText;
  window.formatRivenStat = formatRivenStat;
  window.buildRivenExportText = buildRivenExportText;
  window.buildKuvaExportText = buildKuvaExportText;
  window.buildFrameEntryExportText = buildFrameEntryExportText;
  window.buildIncarnonExportText = buildIncarnonExportText;
  window.copyTextToClipboard = copyTextToClipboard;
  window.wireCopyButtons = wireCopyButtons;
})();
