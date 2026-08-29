// Bootstrap entry point for the Chain View page (index.html). Importing
// these modules runs their top-level side effects (button wiring, listener
// registration) in the same dependency order the original script-tag list
// used: state -> nav -> layout -> render -> inspector -> node-modal ->
// wfcd-wizard -> split-pane.
import { initResizer } from "./split-pane.ts";
import { loadGraph, loadReport } from "./graph-state.ts";
import "./booster.ts";
import "./spoiler-warning.ts";
import "./quest-onboarding.ts";
import "./manual-launcher.ts";
import "./scratch.ts";
import "./kofi-link.ts";
import "./graph-nav.ts";
import "./graph-layout.ts";
import "./graph-render.ts";
import "./graph-pan.ts";
import "./inspector.ts";
import "./node-modal.ts";
import "./wfcd-wizard.ts";
import "./dsl-import.ts";
import "./compact-mode.ts";

// loadGraph() already triggers one loadReport() internally via
// initSidebar() -> selectBuild when a build exists; this second call is the
// same (harmless, idempotent) redundancy the original inline bootstrap
// script had — kept as-is rather than "cleaned up" mid-port.
initResizer();
void loadGraph().then(loadReport);
