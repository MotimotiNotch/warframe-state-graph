# Warframe State Graph

[日本語](README.md) | 🇺🇸 English

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/motimotinotch)

A personal tool that connects the game's in-game dependency graph (items, mods,
syndicates, etc.) to your own ownership state and goals, so it can keep
reconstructing "what's the next move" even after you've been away for a while.

Warframe has no official API for reading a player's own inventory, so this
tool doesn't attempt full auto-sync — instead it deliberately narrows the
scope to a manual, one-tap toggle for just the handful of nodes a registered
build actually needs.

It exists because tracing "I want to build this frame → I'm missing a relic →
getting that relic needs resources I don't have" tends to end in "wait, what
was I even doing" — this is the signpost for that.

## 💛 About tips

The game data itself (fetching public data from WFCD etc.) is free. That
said, **Chain View** is built around its own design philosophy (a flat DAG
model that connects the game's dependency graph with your own state to
dynamically work out the next move), so if you find it useful, a tip via
[Ko-fi](https://ko-fi.com/motimotinotch) is appreciated. Maintenance (bug
fixes etc.) is handled on a best-effort basis.

The pages other than Chain View (Loadouts/Collections/Standing/Stats/Note)
were built with a lighter "would be nice to have this recorded" mindset —
supporting features, not the core.

## 🔒 About network access and data

- **External network access**: read-only fetches of game data (items, mods,
  quests, etc.) from WFCD (`raw.githubusercontent.com/WFCD/...`,
  `api.warframestat.us`) and calamity-inc
  (`raw.githubusercontent.com/calamity-inc/...`, used for the star chart's
  total node counts — a separate public Warframe data project of the same
  kind as WFCD). No personal information is sent or received.
- **Storage of what you enter**: everything you input — completion state,
  mod configs, Riven records, notes, etc. — is saved only to local
  `data/*.json` files and is never sent anywhere externally. Diagnostic logs
  on error (`<data dir>/logs/`) are likewise local-only.
- If a bug occurs, you may be asked to share these JSON files for
  investigation (only when explicitly requested, and always optional).
- **Contact / bug reports**: [X @motimotinotch](https://x.com/motimotinotch)

## ⚠️ A note on spoilers

Because this tool works directly with Warframe's public data (WFCD), it can
show the names of content you haven't played yet — quest names, prerequisite
relationships (Quest chains from Chain View's WFCD auto-generation), and
Kuva/Tenet/Coda-line weapon names among others. It's recommended to avoid
pages you don't want spoiled for your current progress (especially Chain
View's WFCD auto-generation import wizard). The same warning also appears as
a confirmation modal on first launch (each page's first visit)
(`ts/web/spoiler-warning.ts`, shown once via `localStorage`).

Some sections of the Stats page stay collapsed behind a generic "locked
section" label — hiding the actual feature name — until the corresponding
prerequisite quest is marked cleared (`initCollapsiblePanel`, the
`revealedTitle` argument). Once that quest is cleared, the section
automatically expands and shows its real name.

Every effort is made to avoid spoilers, but there may be cases that are
hard to catch or that slip through. Thanks for your understanding.

## Usage (development)

The implementation is TypeScript/Bun only (under `ts/`). The old Go version
(`pkg/`/`cmd/`) and the legacy `web/` directory were fully removed on 2026-08-30.

```
cd ts
bun run dev
```

This starts a local web server at `http://127.0.0.1:8788` (`--hot` reflects
server-side changes automatically; `web/*.ts` is rebuilt on every request, so
saving a file and reloading the browser is enough to see the latest version).

- **Chain View** (`/`): dependency graph display/drill-down/one-tap toggling, WFCD auto node generation (frames/weapons/quests/syndicates, etc.)
- **Loadouts** (`/loadouts.html`): mod configs (A/B/C, single config for companions) and build-set management for frames/weapons/companions
- **Collections** (`/collections.html`): Riven / Kuva·Tenet·Coda weapon acquisition log, frame ownership status, Duviri progress
- **Standing** (`/standing.html`): current rank / highest-reached tracking across 18 syndicates (the 6 major syndicates + 12 open-world etc.)
- **Stats** (`/stats.html`): star chart / Steel Path progress, Intrinsics, read-only aggregation across 4 data sources (also has additional sections that unlock with progress — see "⚠️ A note on spoilers" above)
- **Note** (`/note.html`): a single persistent Markdown memo covering the whole page (for periodic review)

Shared header widgets on every page: a boost timer, light/dark toggle,
wallpaper/icon/blur settings, glossary-mapping editor, a quick-memo (freeform
notes + a manual counter, unrelated to any specific data and separate from
the Note page), and a manual (help that opens in its own window).

## Distribution build (for handing off to non-technical users)

If you're handing this to someone non-technical, they don't need to build it
themselves — **just download the latest
`warframe-state-graph-vX.Y.Z.zip` from [Releases](../../releases)**. Pushing a
tag triggers GitHub Actions to build it automatically and attach it to the
Release (`.github/workflows/release.yml`).

To build it yourself:

```
cd ts
bun run compile
```

The static files under `ts/web/` are embedded into the binary at build time,
so the resulting `ts/dist/warframe-state-graph.exe` runs standalone from a
single file. That said, **don't hand over the bare exe — put it in its own
folder first (or zip it up)**: `data/` (where the graph/Loadouts/Collections
are saved) is auto-created next to the exe at runtime, so leaving a lone exe
in Downloads/Desktop means an unfamiliar folder will later appear to grow
next to it out of nowhere. The safe pattern — like the `WarframeStateGraph/`
folder produced by unzipping a Release — is to **keep the exe and `data/`
self-contained in the same folder**; copying/backing up that whole folder
moves the data along with it. If you want it on the desktop, make a
**shortcut** to the exe inside that folder instead (don't move the exe
itself).

Double-clicking it opens a browser window with no console window and no URL
bar (Microsoft Edge's `--app` mode). Closing that window is all it takes to
quit — the server running behind it shuts down automatically the moment the
window closes.

### How to update

Just overwrite `warframe-state-graph.exe` in your existing folder with the
new Release's `.exe`. `data/` is read and written relative to "the folder the
exe is in," not the exe's own contents, so replacing only the exe file
carries your data over untouched (new fields are absorbed by the Zod
schema's `.default()`, so existing data essentially never becomes
unreadable). If you want extra peace of mind, back up the `data/` folder by
hand before overwriting.

### ⚠️ If first launch is blocked by "Access is denied" or similar

The distributed `warframe-state-graph.exe` is unsigned (no code signing).
Right after a build or download, security software's (Windows Defender,
Norton, etc.) real-time scan can briefly lock/quarantine the file, causing
launch failures like "Access is denied." Waiting several seconds to tens of
seconds and trying again usually resolves it. If it doesn't, check your
security software's quarantine history/notifications and restore it or add
an exclusion as a false positive.

A permanent fix via a code-signing certificate was considered, but for an
anonymous individual-distributed tool, a regular OV certificate doesn't
build up the "download reputation" SmartScreen needs to clear its warning,
making it largely ineffective — and an EV certificate, which clears the
warning immediately, requires corporate registration and is expensive, so
it was passed on.

## Structure

The current implementation lives under `ts/` (TypeScript/Bun). `ts/server/`
is the backend, `ts/web/` is the frontend.

- `server/model.ts`: node/graph type definitions (a flat set of nodes plus directed edges, only 2 kinds: `requires`/`contains`). Node IDs are random 8-digit alphanumeric strings (`generateRandomId()`), with a separate name-based dedup resolver (`resolveNodeIds()`)
- `server/engine.ts`: DAG traversal, Next Action derivation, `requires` cascades (state isn't stored on the node — it's always derived at read time)
- `server/persist.ts`: shared persistence layer for every store (atomic writes, generational backups, automatic recovery from corruption)
- `server/store.ts`: persistence for `data/graph.json`, node re-parenting/detaching (with a cycle guard)
- `server/loadout.ts`: persistence for mod configs and build sets
- `server/collection.ts`: persistence for the Riven / Kuva·Tenet·Coda weapon acquisition log
- `server/standing.ts`: persistence for current rank / highest-reached across the 18 syndicates
- `server/questchain.ts`: quest prerequisite relationships (a static, wiki-sourced table)
- `server/stats.ts`: persistence for star chart / Steel Path progress, Intrinsics, and progress-gated additional sections, plus aggregation across 4 data sources
- `server/starchart.ts`: total node-count aggregation for the star chart (per planet)
- `server/glossary.ts`: EN→JA mapping for in-game terminology (editable configuration data)
- `server/scratch.ts`: persistence for the quick-memo (freeform notes + manual counter) unrelated to any specific data
- `server/note.ts`: persistence for the Note page's single Markdown document
- `server/folder.ts`: persistence for Chain View sidebar folders (goal categorization)
- `server/wfcd.ts`: fetching/caching public WFCD data (frames/weapons/relics, etc.)
- `server/wfcdgen.ts`: logic for auto-generating node candidates from WFCD data
- `server/dsl.ts`: parser for bulk node generation from a text DSL
- `server/log.ts`: file-logging mechanism (`<data dir>/logs/`, keeps the last 14 days)
- `server/main.ts`: local REST API + static file serving, plus automatic setup when running as a compiled binary (`DATA_DIR` detection, Edge auto-launch, etc.)

Design-background details live in the `moti_base` Vault's
`Works/plans/WarframeStateGraph/` (this repository holds only the
implementation code — design docs are managed on the Vault side).

## Contributing

If you're going to change the code, please read [CONTRIBUTING.md](CONTRIBUTING.md)
first. The "About real data (`data/*.json`)" section especially is a
must-read — this repository keeps the repo author's actual play-progress
data under git, and skipping the isolated-verification steps before running
it locally risks accidentally overwriting it. If you're working with an AI
agent like Claude Code, `.claude/skills/warframe-dev/SKILL.md` covers the
same content in a more step-by-step form.

## License

MIT. See `LICENSE` for the rights notices covering the WFCD data and
Warframe itself that this tool references.
