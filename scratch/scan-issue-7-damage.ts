// Issue #7 の被害調査（読み取り専用、2026-09-12）。
//
// cascadeSatisfyContainsParents が `contains` しか見ていなかったせいで、
// `requires` を未達のまま satisfied になったノードが既存データに残っていないかを
// 数える。ついでに、そのノードの前提がカスケードで巻き添えに書き換わっていないか
// も見る（前提側は「未達のはずが satisfied」という形でしか残らないので、
// 断定はできず候補として出す）。
//
// 使い方: bun run scratch/scan-issue-7-damage.ts <graph.json> [<graph.json> ...]
// 書き込みは一切しない。

import type { Graph, Node } from "../ts/server/model.ts";

function label(n: Node): string {
  return `${n.name ?? "(no name)"} [${n.id}]`;
}

async function scan(file: string): Promise<void> {
  const g = (await Bun.file(file).json()) as Graph;
  const nodes = Object.values(g.nodes);

  const bothKinds = nodes.filter((n) => n.contains.length > 0 && n.requires.length > 0);
  // 被害の形: contains を持つ親が satisfied なのに、その requires に未達が残っている。
  // 修正後のカスケードなら決して作れない状態。
  const damaged = bothKinds.filter(
    (n) => n.satisfied && !n.requires.every((id) => g.nodes[id]?.satisfied),
  );

  console.log(`\n=== ${file} ===`);
  console.log(`ノード総数: ${nodes.length}`);
  console.log(`requires と contains を両方持つノード: ${bothKinds.length}`);
  for (const n of bothKinds) {
    const unmet = n.requires.filter((id) => !g.nodes[id]?.satisfied);
    console.log(
      `  - ${label(n)} satisfied=${n.satisfied} contains=${n.contains.length} requires=${n.requires.length} 未達の前提=${unmet.length}`,
    );
  }
  console.log(`前提未達のまま達成済みになっているノード: ${damaged.length}`);
  for (const n of damaged) {
    console.log(`  ! ${label(n)}`);
    for (const id of n.requires) {
      const req = g.nodes[id];
      if (req && !req.satisfied) console.log(`      未達の前提: ${label(req)}`);
    }
  }
}

const files = Bun.argv.slice(2);
if (files.length === 0) {
  console.error("usage: bun run scratch/scan-issue-7-damage.ts <graph.json> [...]");
  process.exit(1);
}
for (const f of files) await scan(f);
