package starchart

import "testing"

func TestGroupPlanets(t *testing.T) {
	raw := map[string]regionNode{
		"SolNode1":  {SystemName: "/Lotus/Language/Locations/Earth"},
		"SolNode2":  {SystemName: "/Lotus/Language/Locations/Earth"},
		"SolNode3":  {SystemName: "/Lotus/Language/Locations/Earth_SPACE"}, // merges into Earth
		"SolNode4":  {SystemName: "/Lotus/Language/Locations/Duviri"},      // excluded entirely
		"SolNode5":  {SystemName: "/Lotus/Language/Locations/ZarimanRegionName"},
		"ClanNode1": {SystemName: "/Lotus/Language/Locations/Earth"}, // Dojo, excluded by ID prefix
	}

	planets := groupPlanets(raw)

	byKey := make(map[string]Planet)
	for _, p := range planets {
		byKey[p.Key] = p
	}

	if _, ok := byKey["Duviri"]; ok {
		t.Errorf("Duviri should be excluded from the planet list")
	}
	if earth, ok := byKey["Earth"]; !ok {
		t.Errorf("Earth missing from planet list")
	} else if earth.NodeCount != 3 {
		t.Errorf("Earth NodeCount = %d, want 3 (2 ground + 1 merged _SPACE, ClanNode excluded)", earth.NodeCount)
	} else if !earth.SteelPathApplicable {
		t.Errorf("Earth should be Steel Path applicable")
	}
	zariman, ok := byKey["ZarimanRegionName"]
	if !ok {
		t.Fatalf("ZarimanRegionName missing from planet list")
	}
	if zariman.DisplayName != "Zariman" {
		t.Errorf("Zariman DisplayName = %q, want %q", zariman.DisplayName, "Zariman")
	}
	if zariman.SteelPathApplicable {
		t.Errorf("Zariman should not be Steel Path applicable")
	}
}
