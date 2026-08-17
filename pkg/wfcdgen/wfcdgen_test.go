package wfcdgen

import (
	"testing"

	"warframe-state-graph/pkg/model"
	"warframe-state-graph/pkg/wfcd"
)

func TestClassifyParadigm(t *testing.T) {
	cases := []struct {
		name string
		item wfcd.Item
		want Paradigm
	}{
		{
			name: "no components, not a pet -> instant",
			item: wfcd.Item{Category: wfcd.CategoryMelee},
			want: ParadigmInstant,
		},
		{
			name: "no components, pet category -> breeding",
			item: wfcd.Item{Category: wfcd.CategoryPets},
			want: ParadigmBreeding,
		},
		{
			name: "zaw component type -> modular",
			item: wfcd.Item{Type: "Zaw Component"},
			want: ParadigmModular,
		},
		{
			name: "single blueprint + generic material without own drops -> single-blueprint",
			item: wfcd.Item{Components: []wfcd.Component{
				{Name: "Blueprint"},
				{Name: "Orokin Cell"},
			}},
			want: ParadigmSingleBlueprint,
		},
		{
			name: "braton prime style, 2+ parts each with own drop -> multi-part",
			item: wfcd.Item{Components: []wfcd.Component{
				{Name: "Braton Prime Barrel", Drops: []wfcd.Drop{{Location: "Axi B1"}}},
				{Name: "Braton Prime Receiver", Drops: []wfcd.Drop{{Location: "Meso B2"}}},
				{Name: "Braton Prime Stock", Drops: []wfcd.Drop{{Location: "Neo B3"}}},
			}},
			want: ParadigmMultiPart,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := ClassifyParadigm(tc.item); got != tc.want {
				t.Errorf("got %s, want %s", got, tc.want)
			}
		})
	}
}

func TestDetectRichLich(t *testing.T) {
	cases := []struct {
		name     string
		wantKind string
		wantOK   bool
	}{
		{"Kuva Bramma", "Kuva", true},
		{"Tenet Cycron", "Tenet", true},
		{"Coda Broadhead", "Coda", true},
		{"Braton Prime", "", false},
	}
	for _, tc := range cases {
		kind, ok := DetectRichLich(tc.name)
		if ok != tc.wantOK || kind != tc.wantKind {
			t.Errorf("DetectRichLich(%q) = (%q, %v), want (%q, %v)", tc.name, kind, ok, tc.wantKind, tc.wantOK)
		}
	}
}

func TestDetectArchetype(t *testing.T) {
	cases := []struct {
		name string
		item wfcd.Item
		want Archetype
	}{
		{"crit-heavy", wfcd.Item{CriticalChance: 0.3, ProcChance: 0.1}, ArchetypeCrit},
		{"status-heavy", wfcd.Item{CriticalChance: 0.1, ProcChance: 0.3}, ArchetypeStatus},
		{"hybrid", wfcd.Item{CriticalChance: 0.3, ProcChance: 0.3}, ArchetypeHybrid},
		{"neither", wfcd.Item{CriticalChance: 0.05, ProcChance: 0.05}, ArchetypeUtility},
	}
	for _, tc := range cases {
		if got := DetectArchetype(tc.item); got != tc.want {
			t.Errorf("%s: got %s, want %s", tc.name, got, tc.want)
		}
	}
}

func TestCheckRiven(t *testing.T) {
	statusWeapon := wfcd.Item{CriticalChance: 0.1, ProcChance: 0.3} // Status archetype

	cases := []struct {
		name          string
		positiveStats []string
		wantMatches   bool
		wantMatched   []string
	}{
		{"status stat matches status weapon", []string{"Status Chance"}, true, []string{"Status Chance"}},
		{"hybrid stat always matches", []string{"Multishot"}, true, []string{"Multishot"}},
		{"crit-only stat does not match status weapon", []string{"Critical Chance"}, false, nil},
		{"unrelated stat does not match", []string{"Reload Speed"}, false, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := CheckRiven(statusWeapon, tc.positiveStats)
			if got.Archetype != ArchetypeStatus {
				t.Fatalf("archetype = %s, want Status", got.Archetype)
			}
			if got.Matches != tc.wantMatches {
				t.Errorf("matches = %v, want %v", got.Matches, tc.wantMatches)
			}
			if len(got.MatchedStats) != len(tc.wantMatched) {
				t.Errorf("matchedStats = %v, want %v", got.MatchedStats, tc.wantMatched)
			}
		})
	}
}

func TestSlug(t *testing.T) {
	if got := Slug("Ash Prime Neuroptics"); got != "ash-prime-neuroptics" {
		t.Errorf("got %q", got)
	}
	if got := Slug("Arch-Gun (Prisma)"); got != "arch-gun-prisma" {
		t.Errorf("got %q", got)
	}
}

func TestBuildSuggestion_MultiPart(t *testing.T) {
	item := wfcd.Item{
		Name:       "Braton Prime",
		UniqueName: "/Lotus/Weapons/Braton/BratonPrime",
		Components: []wfcd.Component{
			{Name: "Braton Prime Barrel", Drops: []wfcd.Drop{{Location: "Void Relic (Axi B1) (25.33%)", Chance: 25.33}}},
			{Name: "Braton Prime Receiver", Drops: []wfcd.Drop{{Location: "Void Relic (Meso B2) (11%)", Chance: 11}}},
		},
	}
	activeRelics := map[string]bool{"Meso B2": true} // Axi B1 は含めずVault済み扱いにする

	sug := BuildSuggestion(item, model.TypeWeapon, activeRelics)

	if sug.Paradigm != ParadigmMultiPart {
		t.Fatalf("paradigm = %s, want multi-part", sug.Paradigm)
	}
	if sug.Root.ID != "braton-prime" || sug.Root.UniqueName != item.UniqueName {
		t.Errorf("root = %+v", sug.Root)
	}
	if len(sug.Root.Contains) != 2 {
		t.Fatalf("root.Contains = %v, want 2 entries", sug.Root.Contains)
	}
	if len(sug.Parts) != 2 {
		t.Fatalf("parts = %d, want 2", len(sug.Parts))
	}

	barrel := sug.Parts[0]
	if barrel.Node.ID != "braton-prime-braton-prime-barrel" {
		t.Errorf("barrel part id = %q", barrel.Node.ID)
	}
	if len(barrel.RelicCandidates) != 1 || !barrel.RelicCandidates[0].Vaulted {
		t.Errorf("barrel relic candidates = %+v, want Axi B1 vaulted=true", barrel.RelicCandidates)
	}

	receiver := sug.Parts[1]
	if len(receiver.RelicCandidates) != 1 || receiver.RelicCandidates[0].Vaulted {
		t.Errorf("receiver relic candidates = %+v, want Meso B2 vaulted=false", receiver.RelicCandidates)
	}
}
