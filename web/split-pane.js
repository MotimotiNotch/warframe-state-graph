const PANEL_WIDTH_KEY = "warframe-state-graph:panelWidths";

// リロードしても比率が消えないよう localStorage に保存する。
// サーバーに送る必要がない単なるUI好みの記憶なので、Cookieより素直なlocalStorageを使う。
function savePanelWidths(graphWidth, panelWidth) {
  try {
    localStorage.setItem(PANEL_WIDTH_KEY, JSON.stringify({ graphWidth, panelWidth }));
  } catch (e) { /* localStorage不可でも致命的ではないので無視 */ }
}

function restorePanelWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(PANEL_WIDTH_KEY));
    if (!saved) return;
    document.getElementById("graph-panel").style.flex = `0 0 ${saved.graphWidth}px`;
    document.getElementById("panel").style.flex = `0 0 ${saved.panelWidth}px`;
  } catch (e) { /* 壊れた保存値は無視してデフォルトのまま */ }
}

function initResizer() {
  const layout = document.querySelector(".layout");
  const graphPanel = document.getElementById("graph-panel");
  const panel = document.getElementById("panel");
  const resizer = document.getElementById("resizer");

  restorePanelWidths();

  resizer.addEventListener("mousedown", (e) => {
    e.preventDefault();
    resizer.classList.add("dragging");
    const layoutRect = layout.getBoundingClientRect();
    const resizerWidth = resizer.getBoundingClientRect().width;
    let lastGraphWidth, lastPanelWidth;

    function onMove(moveEvt) {
      const minGraph = 300, minPanel = 220;
      const available = layoutRect.width - resizerWidth;
      let graphWidth = moveEvt.clientX - layoutRect.left;
      graphWidth = Math.max(minGraph, Math.min(graphWidth, available - minPanel));
      const panelWidth = available - graphWidth;

      graphPanel.style.flex = `0 0 ${graphWidth}px`;
      panel.style.flex = `0 0 ${panelWidth}px`;
      lastGraphWidth = graphWidth;
      lastPanelWidth = panelWidth;
    }
    function onUp() {
      resizer.classList.remove("dragging");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (lastGraphWidth !== undefined) savePanelWidths(lastGraphWidth, lastPanelWidth);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  });
}
