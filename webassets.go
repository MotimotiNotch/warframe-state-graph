// Package webassets embeds the web/ static frontend directly into the
// compiled binary so a distributed build is a single self-contained exe —
// no separate web/ folder has to travel alongside it for a non-technical
// user to double-click and run. This file must live at the module root
// because //go:embed can only reach files under its own source file's
// directory, and web/ is a root-level sibling of cmd/, not a subdirectory
// of cmd/server.
package webassets

import "embed"

//go:embed all:web
var FS embed.FS
