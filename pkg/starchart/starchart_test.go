package starchart

import "testing"

func TestGroupPlanets(t *testing.T) {
	raw := map[string]regionNode{
		"SolNode1":  {SystemName: "/Lotus/Language/Locations/Earth"},
		"SolNode2":  {SystemName: "/Lotus/Language/Locations/Earth"},
		"SolNode3":  {SystemName: "/Lotus/Language/Locations/Earth_SPACE"}, // Railjack Proxima, excluded (groupProximaの担当)
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
	} else if earth.NodeCount != 2 {
		t.Errorf("Earth NodeCount = %d, want 2 (2 ground only, _SPACE excluded, ClanNode excluded)", earth.NodeCount)
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

func TestGroupProxima(t *testing.T) {
	raw := map[string]regionNode{
		"SolNode1":  {SystemName: "/Lotus/Language/Locations/Earth"}, // ground, not Proxima
		"SolNode2":  {SystemName: "/Lotus/Language/Locations/Earth_SPACE"},
		"SolNode3":  {SystemName: "/Lotus/Language/Locations/Earth_SPACE"},
		"SolNode4":  {SystemName: "/Lotus/Language/Locations/DeepSpace_SPACE"}, // Veil Proxima
		"SolNode5":  {SystemName: "/Lotus/Language/Locations/Uranus_SPACE"},    // excluded (Jade Shadows Part 2)
		"ClanNode1": {SystemName: "/Lotus/Language/Locations/Earth_SPACE"},     // Dojo, excluded by ID prefix
	}

	proxima := groupProxima(raw)

	byKey := make(map[string]Proxima)
	for _, p := range proxima {
		byKey[p.Key] = p
	}

	if _, ok := byKey["Earth"]; !ok {
		t.Fatalf("Earth missing from proxima list")
	} else if byKey["Earth"].NodeCount != 2 {
		t.Errorf("Earth Proxima NodeCount = %d, want 2", byKey["Earth"].NodeCount)
	} else if byKey["Earth"].DisplayName != "Earth Proxima" {
		t.Errorf("Earth Proxima DisplayName = %q, want %q", byKey["Earth"].DisplayName, "Earth Proxima")
	}
	if deepSpace, ok := byKey["DeepSpace"]; !ok {
		t.Fatalf("DeepSpace (Veil Proxima) missing from proxima list")
	} else if deepSpace.DisplayName != "Veil Proxima" {
		t.Errorf("DeepSpace DisplayName = %q, want %q", deepSpace.DisplayName, "Veil Proxima")
	}
	if _, ok := byKey["Uranus"]; ok {
		t.Errorf("Uranus (Jade Shadows Part 2) should be excluded from the proxima list")
	}
	if _, ok := byKey["Ground"]; ok {
		t.Errorf("non-_SPACE systemName should not appear in the proxima list")
	}
}
