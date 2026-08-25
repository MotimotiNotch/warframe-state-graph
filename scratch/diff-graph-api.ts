// One-off verification script for the TS migration, Phase 3.
// Compares Go (isolated copy, :8789) vs TS (:8788) server responses against
// the SAME scratch-data copy, including a toggle sequence to check cascade
// parity, not just static-read parity. Per the migration plan, this harness
// is meant to be reused (not rebuilt) in every later phase.
//
// Run with both isolated servers up and pointed at the same data copy:
//   bun run scratch/diff-graph-api.ts

const GO = "http://127.0.0.1:8789";
const TS = "http://127.0.0.1:8788";

async function getJSON(base: string, path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`);
  if (!res.ok) throw new Error(`${base}${path} -> ${res.status}`);
  return res.json();
}

async function postJSON(base: string, path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`, { method: "POST" });
  if (!res.ok) throw new Error(`${base}${path} -> ${res.status}`);
  return res.json();
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
}

// JSON.stringify is key-order-sensitive; normalize both sides so map/object
// key ordering differences (which don't matter semantically) don't produce
// false-positive diffs.
function sortKeysDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeysDeep);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) {
      out[k] = sortKeysDeep((v as Record<string, unknown>)[k]);
    }
    return out;
  }
  return v;
}

let failures = 0;
function check(label: string, a: unknown, b: unknown): void {
  if (deepEqual(a, b)) {
    console.log(`OK   ${label}`);
  } else {
    failures++;
    console.log(`FAIL ${label}`);
    console.log("  go:", JSON.stringify(a).slice(0, 300));
    console.log("  ts:", JSON.stringify(b).slice(0, 300));
  }
}

async function main() {
  // 1. Static read parity.
  check("GET /api/graph", await getJSON(GO, "/api/graph"), await getJSON(TS, "/api/graph"));
  check(
    "GET /api/next-actions?build=ash-stealth-build",
    await getJSON(GO, "/api/next-actions?build=ash-stealth-build"),
    await getJSON(TS, "/api/next-actions?build=ash-stealth-build"),
  );

  // 2. Cascade parity: toggle dragon-nikana-riven (currently unsatisfied,
  // no requires of its own) satisfied, then unsatisfied again, diffing the
  // resulting node state and next-actions report at each step.
  check(
    "POST /api/nodes/dragon-nikana-riven/toggle (satisfy)",
    await postJSON(GO, "/api/nodes/dragon-nikana-riven/toggle"),
    await postJSON(TS, "/api/nodes/dragon-nikana-riven/toggle"),
  );
  check(
    "next-actions after satisfy",
    await getJSON(GO, "/api/next-actions?build=ash-stealth-build"),
    await getJSON(TS, "/api/next-actions?build=ash-stealth-build"),
  );

  // 3. Deeper cascade: toggle natah-quest satisfied — should cascade through
  // war-within-quest -> second-dream-quest -> apostasy-prologue ->
  // chains-of-harrow -> saya-vigil (a real chain already in the seed data).
  check(
    "POST /api/nodes/natah-quest/toggle (satisfy, cascades prerequisites)",
    await postJSON(GO, "/api/nodes/natah-quest/toggle"),
    await postJSON(TS, "/api/nodes/natah-quest/toggle"),
  );
  check(
    "GET /api/graph after natah-quest cascade",
    await getJSON(GO, "/api/graph"),
    await getJSON(TS, "/api/graph"),
  );

  // 4. Unwind: toggle natah-quest back off — should cascade-unsatisfy its
  // dependent (steel-path-junction), not its prerequisites.
  check(
    "POST /api/nodes/natah-quest/toggle (unsatisfy, cascades dependents)",
    await postJSON(GO, "/api/nodes/natah-quest/toggle"),
    await postJSON(TS, "/api/nodes/natah-quest/toggle"),
  );
  check(
    "POST /api/nodes/dragon-nikana-riven/toggle (unsatisfy, restore baseline)",
    await postJSON(GO, "/api/nodes/dragon-nikana-riven/toggle"),
    await postJSON(TS, "/api/nodes/dragon-nikana-riven/toggle"),
  );
  check(
    "GET /api/graph after full unwind",
    await getJSON(GO, "/api/graph"),
    await getJSON(TS, "/api/graph"),
  );

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
