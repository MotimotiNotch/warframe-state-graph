package main

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	webassets "warframe-state-graph"
	"warframe-state-graph/pkg/collection"
	"warframe-state-graph/pkg/engine"
	"warframe-state-graph/pkg/glossary"
	"warframe-state-graph/pkg/loadout"
	"warframe-state-graph/pkg/model"
	"warframe-state-graph/pkg/scratch"
	"warframe-state-graph/pkg/standing"
	"warframe-state-graph/pkg/starchart"
	"warframe-state-graph/pkg/stats"
	"warframe-state-graph/pkg/store"
	"warframe-state-graph/pkg/wfcd"
	"warframe-state-graph/pkg/wfcdgen"
)

// weaponCategories は nodeType=Weapon の自動生成候補（WFCD generate/Riven check共通）を
// 探す際に順に試すカテゴリ。フレーム側は Warframes 一択なので迷わない。
var weaponCategories = []string{wfcd.CategoryPrimary, wfcd.CategorySecondary, wfcd.CategoryMelee}

// findItemInCategories は複数カテゴリを順に試して名前一致するWFCDアイテムを探す共通ヘルパー
// （WFCD自動生成とRiven一致判定の両方で武器を名前引きする必要があるため切り出した）。
func findItemInCategories(wfcdCacheDir string, categories []string, name string) (wfcd.Item, bool) {
	for _, cat := range categories {
		items, err := wfcd.CachedItemsFull(wfcdCacheDir, cat)
		if err != nil {
			continue
		}
		if it, hit := wfcd.FindItemByName(items, name); hit {
			return it, true
		}
	}
	return wfcd.Item{}, false
}

// resolveRoot picks the directory data/ (and, pre-embed, web/) live under.
// A distributed build should keep its data next to the exe wherever the
// user puts it (double-clicked from Desktop, a USB drive, etc.), so the
// default is os.Executable()'s directory. `go run` compiles to a throwaway
// binary under the Go build cache first, though — using that path would
// silently write data/ into a temp folder during local dev — so this falls
// back to the working directory (the existing `go run ./cmd/server` from
// the repo root, unchanged) whenever the exe path looks like a build-cache
// temp file rather than a real installed location.
func resolveRoot() string {
	exePath, err := os.Executable()
	if err == nil {
		dir := filepath.Dir(exePath)
		if !strings.Contains(strings.ToLower(dir), "go-build") {
			return dir
		}
	}
	wd, err := os.Getwd()
	if err != nil {
		log.Fatal(err)
	}
	return wd
}

func main() {
	root := resolveRoot()
	dataPath := filepath.Join(root, "data", "graph.json")
	loadoutPath := filepath.Join(root, "data", "loadouts.json")
	collectionsPath := filepath.Join(root, "data", "collections.json")

	standingPath := filepath.Join(root, "data", "standing.json")
	glossaryPath := filepath.Join(root, "data", "glossary.json")
	statsPath := filepath.Join(root, "data", "stats.json")
	scratchPath := filepath.Join(root, "data", "scratch.json")

	webRoot, err := fs.Sub(webassets.FS, "web")
	if err != nil {
		log.Fatal(err)
	}

	st := store.NewFileStore(dataPath)
	ls := loadout.NewFileStore(loadoutPath)
	cs := collection.NewFileStore(collectionsPath)
	ss := standing.NewFileStore(standingPath)
	gs := glossary.NewFileStore(glossaryPath)
	sts := stats.NewFileStore(statsPath)
	scs := scratch.NewFileStore(scratchPath)
	wfcdCacheDir := filepath.Join(root, "data", "wfcd-cache")

	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/graph", func(w http.ResponseWriter, r *http.Request) {
		g, err := st.Load()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, g)
	})

	mux.HandleFunc("GET /api/next-actions", func(w http.ResponseWriter, r *http.Request) {
		buildID := r.URL.Query().Get("build")
		if buildID == "" {
			http.Error(w, "missing ?build=<nodeId>", http.StatusBadRequest)
			return
		}
		g, err := st.Load()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if _, ok := g.Nodes[buildID]; !ok {
			http.Error(w, "build not found: "+buildID, http.StatusNotFound)
			return
		}
		report := engine.DeriveNextActions(g, buildID)
		writeJSON(w, report)
	})

	mux.HandleFunc("POST /api/nodes/{id}/toggle", func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		node, err := st.ToggleSatisfied(id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, node)
	})

	mux.HandleFunc("GET /api/loadouts", func(w http.ResponseWriter, r *http.Request) {
		d, err := ls.Load()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/loadout-items", func(w http.ResponseWriter, r *http.Request) {
		var item loadout.Item
		if err := json.NewDecoder(r.Body).Decode(&item); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if item.ID == "" || item.Name == "" {
			http.Error(w, "id and name are required", http.StatusBadRequest)
			return
		}
		if err := ls.UpsertItem(&item); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, item)
	})

	mux.HandleFunc("DELETE /api/loadout-items/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := ls.DeleteItem(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/loadout-items/{id}/configs/{slot}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Mods []string `json:"mods"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		slot := loadout.ConfigSlot(r.PathValue("slot"))
		item, err := ls.SetConfig(r.PathValue("id"), slot, body.Mods)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, item)
	})

	mux.HandleFunc("POST /api/build-sets", func(w http.ResponseWriter, r *http.Request) {
		var set loadout.BuildSet
		if err := json.NewDecoder(r.Body).Decode(&set); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if set.ID == "" || set.Name == "" {
			http.Error(w, "id and name are required", http.StatusBadRequest)
			return
		}
		if err := ls.UpsertBuildSet(&set); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, set)
	})

	mux.HandleFunc("DELETE /api/build-sets/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := ls.DeleteBuildSet(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// クイックメモ（Chain View/Loadouts/Collections/Standing/Statsのどれにも紐づかない、
	// ヘッダーの新規アイコンから全ページ共通で開くスクラッチ領域。2026-08-21追加）。
	mux.HandleFunc("GET /api/scratch", func(w http.ResponseWriter, r *http.Request) {
		d, err := scs.Load()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("PUT /api/scratch/note", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Note string `json:"note"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		d, err := scs.SetNote(body.Note)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/scratch/counters", func(w http.ResponseWriter, r *http.Request) {
		var c scratch.Counter
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if c.ID == "" {
			http.Error(w, "id is required", http.StatusBadRequest)
			return
		}
		d, err := scs.AddCounter(c)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/scratch/counters/{id}/increment", func(w http.ResponseWriter, r *http.Request) {
		c, err := scs.IncrementCounter(r.PathValue("id"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, c)
	})

	mux.HandleFunc("PUT /api/scratch/counters/{id}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Label string `json:"label"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		c, err := scs.RenameCounter(r.PathValue("id"), body.Label)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, c)
	})

	mux.HandleFunc("DELETE /api/scratch/counters/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := scs.DeleteCounter(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// Collections（Chain View/Loadoutsとは独立したRiven/Kuva入手ログ）。
	mux.HandleFunc("GET /api/collections", func(w http.ResponseWriter, r *http.Request) {
		d, err := cs.Load()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/collections/rivens", func(w http.ResponseWriter, r *http.Request) {
		var entry collection.RivenEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if entry.ID == "" || entry.WeaponName == "" {
			http.Error(w, "id and weaponName are required", http.StatusBadRequest)
			return
		}
		if err := cs.UpsertRiven(&entry); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, entry)
	})

	mux.HandleFunc("DELETE /api/collections/rivens/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := cs.DeleteRiven(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/collections/kuva", func(w http.ResponseWriter, r *http.Request) {
		var entry collection.KuvaEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if entry.ID == "" || entry.WeaponName == "" {
			http.Error(w, "id and weaponName are required", http.StatusBadRequest)
			return
		}
		if err := cs.UpsertKuva(&entry); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, entry)
	})

	mux.HandleFunc("DELETE /api/collections/kuva/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := cs.DeleteKuva(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/collections/frames", func(w http.ResponseWriter, r *http.Request) {
		var entry collection.FrameEntry
		if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if entry.ID == "" || entry.Name == "" {
			http.Error(w, "id and name are required", http.StatusBadRequest)
			return
		}
		if err := cs.UpsertFrame(&entry); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, entry)
	})

	mux.HandleFunc("DELETE /api/collections/frames/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := cs.DeleteFrame(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.HandleFunc("POST /api/collections/duviri", func(w http.ResponseWriter, r *http.Request) {
		var duviri collection.DuviriData
		if err := json.NewDecoder(r.Body).Decode(&duviri); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if err := cs.SetDuviri(duviri); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, duviri)
	})

	// Standing（6大シンジケートの現在ランク一覧、Chain View/Loadouts/Collectionsとは
	// 独立した4つ目のページ）。ランクは -2〜5 の値そのものを保持する（下降もありうるため、
	// requires連鎖トグルではなく直接更新方式。pkg/standingのパッケージコメント参照）。
	mux.HandleFunc("GET /api/standing", func(w http.ResponseWriter, r *http.Request) {
		d, err := ss.Load()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, map[string]any{"data": d, "syndicates": standing.AllSyndicates})
	})

	mux.HandleFunc("POST /api/standing/{syndicate}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Rank int `json:"rank"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		syn, ok := standing.FindSyndicate(r.PathValue("syndicate"))
		if !ok {
			http.Error(w, "unknown syndicate", http.StatusNotFound)
			return
		}
		if body.Rank < syn.MinRank() || body.Rank > syn.MaxRank() {
			http.Error(w, fmt.Sprintf("rank must be between %d and %d for this syndicate", syn.MinRank(), syn.MaxRank()), http.StatusBadRequest)
			return
		}
		d, err := ss.SetRank(r.PathValue("syndicate"), body.Rank)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	// 最高到達実績の手動訂正。現在ランクの誤選択でHighestRankReachedが意図せず繰り上がった
	// 場合に、SetRankの「大きい方だけ採用」クランプを経由せず直接書き換えるための操作。
	mux.HandleFunc("POST /api/standing/{syndicate}/highest", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Rank int `json:"rank"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		syn, ok := standing.FindSyndicate(r.PathValue("syndicate"))
		if !ok {
			http.Error(w, "unknown syndicate", http.StatusNotFound)
			return
		}
		if body.Rank < 0 || body.Rank > syn.MaxRank() {
			http.Error(w, fmt.Sprintf("rank must be between 0 and %d for this syndicate", syn.MaxRank()), http.StatusBadRequest)
			return
		}
		d, err := ss.SetHighestRankReached(r.PathValue("syndicate"), body.Rank)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("GET /api/glossary", func(w http.ResponseWriter, r *http.Request) {
		d, err := gs.Load()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/glossary", func(w http.ResponseWriter, r *http.Request) {
		var e glossary.Entry
		if err := json.NewDecoder(r.Body).Decode(&e); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if e.EnKey == "" || e.Ja == "" {
			http.Error(w, "enKey and ja are required", http.StatusBadRequest)
			return
		}
		d, err := gs.Upsert(e)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("DELETE /api/glossary/{key}", func(w http.ResponseWriter, r *http.Request) {
		d, err := gs.Delete(r.PathValue("key"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	// 星図(Star Chart)の惑星別ノード総数（分母）。既存のwfcdキャッシュディレクトリ・
	// 更新ボタン（/api/wfcd/refresh）にそのまま乗る（2026-08-19、Statsページ用）。
	mux.HandleFunc("GET /api/starchart/planets", func(w http.ResponseWriter, r *http.Request) {
		planets, err := wfcd.CachedJSON(wfcdCacheDir, "starchart-planets.json", starchart.FetchPlanets)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, planets)
	})

	// Stats: 星図/Steel Path進捗（分子）とIntrinsicsランク。4データソース横断集計はここでは
	// 持たず、フロントエンドが既存の各GET API（graph/loadouts/collections/standing）を
	// 読み合わせて計算する（2026-08-19設計）。
	mux.HandleFunc("GET /api/stats", func(w http.ResponseWriter, r *http.Request) {
		d, err := sts.Load()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/stats/planets/{key}", func(w http.ResponseWriter, r *http.Request) {
		var progress stats.PlanetProgress
		if err := json.NewDecoder(r.Body).Decode(&progress); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if progress.Cleared < 0 || progress.SteelPathCleared < 0 {
			http.Error(w, "cleared and steelPathCleared must be >= 0", http.StatusBadRequest)
			return
		}
		d, err := sts.SetPlanetProgress(r.PathValue("key"), progress)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/stats/railjack/{category}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Rank int `json:"rank"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.Rank < stats.IntrinsicMinRank || body.Rank > stats.IntrinsicMaxRank {
			http.Error(w, "rank must be between 0 and 10", http.StatusBadRequest)
			return
		}
		d, err := sts.SetRailjackIntrinsic(r.PathValue("category"), body.Rank)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/stats/drifter/{category}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Rank int `json:"rank"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.Rank < stats.IntrinsicMinRank || body.Rank > stats.IntrinsicMaxRank {
			http.Error(w, "rank must be between 0 and 10", http.StatusBadRequest)
			return
		}
		d, err := sts.SetDrifterIntrinsic(r.PathValue("category"), body.Rank)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	// Focus School: 5校の投資段階（3値集約）＋現在アクティブな校（2026-08-20、項目23）。
	mux.HandleFunc("POST /api/stats/focus/{school}", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Investment stats.FocusInvestment `json:"investment"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !stats.IsValidFocusInvestment(body.Investment) {
			http.Error(w, "investment must be one of: not_invested, in_progress, maxed", http.StatusBadRequest)
			return
		}
		d, err := sts.SetFocusInvestment(r.PathValue("school"), body.Investment)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/stats/focus-active", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			School string `json:"school"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if body.School != "" && !stats.IsValidRailjackValue(body.School, stats.FocusSchools) {
			http.Error(w, "school must be a valid Focus School name, or empty to unset", http.StatusBadRequest)
			return
		}
		d, err := sts.SetFocusActiveSchool(body.School)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	// Railjack本体: 4部品の粗い現在装備（House×Grade）＋Plexus modの自由記述メモ（2026-08-20、項目23）。
	mux.HandleFunc("POST /api/stats/railjack-component/{slot}", func(w http.ResponseWriter, r *http.Request) {
		var body stats.RailjackComponent
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if !stats.IsValidRailjackValue(body.House, stats.ValidRailjackHouses) {
			http.Error(w, "house must be one of: (empty), Zetki, Lavan, Vidar", http.StatusBadRequest)
			return
		}
		if !stats.IsValidRailjackValue(body.Grade, stats.ValidRailjackGrades) {
			http.Error(w, "grade must be one of: (empty), Mk I, Mk II, Mk III", http.StatusBadRequest)
			return
		}
		d, err := sts.SetRailjackComponent(r.PathValue("slot"), body)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	mux.HandleFunc("POST /api/stats/railjack-plexus-note", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Note string `json:"note"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		d, err := sts.SetRailjackPlexusNote(body.Note)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, d)
	})

	// フレーム/武器名をWFCDの公開データから取得（初回のみfetch、以後はローカルキャッシュ）。
	// loadouts.htmlの「アイテム追加」で自由入力の代わりに実データから選べるようにするため。
	mux.HandleFunc("GET /api/reference/frames", func(w http.ResponseWriter, r *http.Request) {
		names, err := wfcd.CachedNames(wfcdCacheDir, "frames.json", wfcd.FetchFrameNames)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, names)
	})

	mux.HandleFunc("GET /api/reference/weapons", func(w http.ResponseWriter, r *http.Request) {
		names, err := wfcd.CachedNames(wfcdCacheDir, "weapons.json", wfcd.FetchWeaponNames)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, names)
	})

	mux.HandleFunc("GET /api/reference/companions", func(w http.ResponseWriter, r *http.Request) {
		names, err := wfcd.CachedNames(wfcdCacheDir, "companions.json", wfcd.FetchCompanionNames)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, names)
	})

	// ノード新規作成・編集（現状data/graph.json直接編集だったマイルストーンの解消）。
	mux.HandleFunc("POST /api/nodes", func(w http.ResponseWriter, r *http.Request) {
		var n model.Node
		if err := json.NewDecoder(r.Body).Decode(&n); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if n.ID == "" || n.Name == "" {
			http.Error(w, "id and name are required", http.StatusBadRequest)
			return
		}
		if err := st.UpsertNode(&n); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, n)
	})

	mux.HandleFunc("DELETE /api/nodes/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := st.DeleteNode(r.PathValue("id")); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	// Gild状態のトグル（Zaw/Kitgun/Amp等のマスタリー担当パーツ専用、satisfiedとは独立）。
	mux.HandleFunc("POST /api/nodes/{id}/gild-toggle", func(w http.ResponseWriter, r *http.Request) {
		n, err := st.ToggleGilded(r.PathValue("id"))
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, n)
	})

	// WFCDデータから該当アイテムのノード生成候補（パラダイム/リッチ系判定/アーキタイプ/
	// パーツ→レリック候補）を返す。実際にグラフへ入れるかはユーザー確認後 /api/wfcd/import で。
	mux.HandleFunc("GET /api/wfcd/generate", func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		nodeType := model.NodeType(r.URL.Query().Get("nodeType"))
		if name == "" || (nodeType != model.TypeFrame && nodeType != model.TypeWeapon && nodeType != model.TypeQuest) {
			http.Error(w, "name and nodeType (Frame|Weapon|Quest) are required", http.StatusBadRequest)
			return
		}

		// クエストはWFCDアイテムデータを介さず、questchainの静的テーブル（前提クエスト連鎖）
		// だけで完結する（03_Data_Source_Research.md記載どおり、前提関係はWFCD/Public Export
		// どちらの静的データにも存在しないため）。
		if nodeType == model.TypeQuest {
			writeJSON(w, wfcdgen.BuildQuestSuggestion(name))
			return
		}

		categories := []string{wfcd.CategoryWarframes}
		if nodeType == model.TypeWeapon {
			categories = weaponCategories
		}
		found, ok := findItemInCategories(wfcdCacheDir, categories, name)
		if !ok {
			http.Error(w, "item not found in WFCD data: "+name, http.StatusNotFound)
			return
		}

		// レリックVault判定は取得できなくても提案自体は成立させる（ベストエフォート）。
		activeRelics, err := wfcd.CachedActiveRelicNames(wfcdCacheDir)
		if err != nil {
			log.Printf("active relics unavailable, vault status will be omitted: %v", err)
			activeRelics = nil
		}

		// シンジケートランク候補も同様にベストエフォート（取れなくても他の提案は成立させる）。
		syndicates, err := wfcd.CachedSyndicates(wfcdCacheDir)
		if err != nil {
			log.Printf("syndicate data unavailable, rank suggestion will be omitted: %v", err)
			syndicates = nil
		}

		writeJSON(w, wfcdgen.BuildSuggestion(found, nodeType, activeRelics, syndicates))
	})

	// 自動生成候補（ユーザーがレリック候補を選び終えた状態）を一括でグラフに取り込む。
	mux.HandleFunc("POST /api/wfcd/import", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Nodes []*model.Node `json:"nodes"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		if len(body.Nodes) == 0 {
			http.Error(w, "nodes must not be empty", http.StatusBadRequest)
			return
		}
		if err := st.UpsertNodes(body.Nodes); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, body.Nodes)
	})

	// Riven専用入力UIの選択肢一覧（ポジ値として意味のあるステータス名）。
	mux.HandleFunc("GET /api/wfcd/riven-stats", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, wfcdgen.RivenStatChoices)
	})

	// 対象武器のアーキタイプとRivenのポジ値ステータス群が噛み合っているかを判定する
	// （02_Requirements_and_Roadmap.md item2のスコープ通り、理論値レンジ計算は行わない）。
	mux.HandleFunc("GET /api/wfcd/riven-check", func(w http.ResponseWriter, r *http.Request) {
		weaponName := r.URL.Query().Get("weapon")
		if weaponName == "" {
			http.Error(w, "missing ?weapon=", http.StatusBadRequest)
			return
		}
		var positive []string
		if raw := r.URL.Query().Get("positive"); raw != "" {
			for _, s := range strings.Split(raw, ",") {
				if s = strings.TrimSpace(s); s != "" {
					positive = append(positive, s)
				}
			}
		}

		item, ok := findItemInCategories(wfcdCacheDir, weaponCategories, weaponName)
		if !ok {
			http.Error(w, "weapon not found in WFCD data: "+weaponName, http.StatusNotFound)
			return
		}
		writeJSON(w, wfcdgen.CheckRiven(item, positive))
	})

	// レリックがVault済み（現行ドロップテーブル外）かどうか。
	mux.HandleFunc("GET /api/wfcd/relic-status", func(w http.ResponseWriter, r *http.Request) {
		name := r.URL.Query().Get("name")
		if name == "" {
			http.Error(w, "missing ?name=", http.StatusBadRequest)
			return
		}
		activeRelics, err := wfcd.CachedActiveRelicNames(wfcdCacheDir)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, map[string]bool{"vaulted": wfcd.IsRelicVaulted(activeRelics, name)})
	})

	// Prime Resurgence（Varzia）の現行ローテーション在庫。Vault済みフレーム/武器でも
	// 期限つきで代替入手できる場合があるため、Inspector側で該当ノード名と突き合わせて表示する。
	mux.HandleFunc("GET /api/wfcd/resurgence", func(w http.ResponseWriter, r *http.Request) {
		vt, err := wfcd.CachedVaultTrader(wfcdCacheDir)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, vt)
	})

	// アイテムの日本語名（i18n.json、52MBのためストリーム走査で該当キーだけ取得）。
	mux.HandleFunc("GET /api/wfcd/i18n", func(w http.ResponseWriter, r *http.Request) {
		uniqueName := r.URL.Query().Get("uniqueName")
		lang := r.URL.Query().Get("lang")
		if lang == "" {
			lang = "ja"
		}
		if uniqueName == "" {
			http.Error(w, "missing ?uniqueName=", http.StatusBadRequest)
			return
		}
		name, err := wfcd.LookupI18nName(wfcdCacheDir, uniqueName, lang)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		writeJSON(w, map[string]string{"name": name})
	})

	// WFCDキャッシュを丸ごと消して次回アクセス時に再取得させる（項目16の手動更新ボタン用）。
	mux.HandleFunc("POST /api/wfcd/refresh", func(w http.ResponseWriter, r *http.Request) {
		if err := wfcd.RefreshCache(wfcdCacheDir); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})

	mux.Handle("/", http.FileServer(http.FS(webRoot)))

	addr := "127.0.0.1:8787"
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatal(err)
	}
	log.Printf("warframe-state-graph server listening on http://%s (data=%s)", addr, dataPath)
	go openBrowser("http://" + addr)
	log.Fatal(http.Serve(ln, mux))
}

// openBrowser launches the OS default browser pointed at url. This is what
// lets a non-technical user just double-click the exe — no terminal, no
// manually typing localhost:8787 — the app opens itself. Best-effort: if it
// fails, the server is still up and the console log prints the URL to open
// by hand.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("cmd", "/c", "start", "", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	if err := cmd.Start(); err != nil {
		log.Printf("could not auto-open browser, open %s manually: %v", url, err)
	}
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write json response: %v", err)
	}
}
