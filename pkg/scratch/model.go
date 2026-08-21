package scratch

// Counter は「Void Trace 145個集めた」のような、ボタンで+1していく簡易カウンター。
// ラベルは自由記述、値はカウントアップ操作でのみ増える（減算UIは今回のスコープ外、
// 間違えたら削除して作り直す運用を想定）。
type Counter struct {
	ID    string `json:"id"`
	Label string `json:"label"`
	Value int    `json:"value"`
}

// Data は Chain View/Loadouts/Collections/Standing/Stats のどのエンティティにも紐づかない、
// 全ページ共通のクイックメモ（ヘッダーの新規アイコンから開くモーダル用）。
// 「一時的に残しておきたいもの」を置く場所という性質上、Note欄と同じ軽量Markdown表示
// （web/notemd.js、チェックリスト対応）をそのまま流用する想定（2026-08-21設計）。
type Data struct {
	SchemaVersion int       `json:"schemaVersion"`
	Note          string    `json:"note"`
	Counters      []Counter `json:"counters"`
}

const CurrentSchemaVersion = 1

func NewData() *Data {
	return &Data{SchemaVersion: CurrentSchemaVersion, Counters: []Counter{}}
}
