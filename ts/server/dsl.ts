// Text-DSL bulk node generator (item 29, 02_Requirements_and_Roadmap.md).
// Syntax: `A -> B -> [A' -> B'], A -> D` where `X -> Y` means "X requires Y"
// and `[...]` attaches to the immediately preceding node's `contains` (the
// bracket's first node becomes the containment target; `->` inside a
// bracket keeps meaning `requires`, recursively). This maps 1:1 onto the
// existing flat-DAG primitives (requires/contains only), so the parser is a
// deterministic tokenize -> recursive-descent pass — no LLM involved.
//
// A name written twice resolves to the same node (same id) — that's the
// point of item 29's example (`A` appears in two branches and must not
// become two separate nodes). Node ids are the trimmed name itself (not a
// WFCD-style slug): this DSL takes arbitrary user-typed names, including
// Japanese, which a `[^a-z0-9]+` slug would collapse into indistinguishable
// dashes.

import type { Node } from "./model.ts";

export interface DslError {
  message: string;
  pos: number;
}

export interface DslParseResult {
  nodes: Node[];
  errors: DslError[];
}

type TokenType = "IDENT" | "ARROW" | "COMMA" | "LBRACKET" | "RBRACKET";
interface Token {
  type: TokenType;
  value: string;
  pos: number;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let buf = "";
  let bufStart = 0;
  const flush = (): void => {
    // Collapse internal whitespace (including a line break from the name
    // wrapping mid-identifier in the <textarea>) to a single space, not just
    // trim the ends — otherwise "Mag Prime" typed on one visual line and
    // "Mag\n  Prime" wrapped across two both flow into the identifier buffer
    // verbatim and become two distinct node ids that render identically,
    // silently defeating the "same name = same node" dedup this DSL exists
    // for (found 2026-08-29: a single paste produced two "Mag Prime" nodes).
    const trimmed = buf.replace(/\s+/g, " ").trim();
    if (trimmed) tokens.push({ type: "IDENT", value: trimmed, pos: bufStart });
    buf = "";
  };
  while (i < input.length) {
    if (input.startsWith("->", i)) {
      flush();
      tokens.push({ type: "ARROW", value: "->", pos: i });
      i += 2;
      bufStart = i;
    } else if (input[i] === ",") {
      flush();
      tokens.push({ type: "COMMA", value: ",", pos: i });
      i += 1;
      bufStart = i;
    } else if (input[i] === "[") {
      flush();
      tokens.push({ type: "LBRACKET", value: "[", pos: i });
      i += 1;
      bufStart = i;
    } else if (input[i] === "]") {
      flush();
      tokens.push({ type: "RBRACKET", value: "]", pos: i });
      i += 1;
      bufStart = i;
    } else {
      if (buf === "") bufStart = i;
      buf += input[i];
      i += 1;
    }
  }
  flush();
  return tokens;
}

class DslSyntaxError extends Error {
  pos: number;
  constructor(message: string, pos: number) {
    super(message);
    this.pos = pos;
  }
}

function newNode(name: string): Node {
  return { id: name, name, type: "Goal", satisfied: false, requires: [], contains: [] };
}

/** Parses DSL text into a flat-DAG node set. Never throws — syntax problems
 * come back as `errors` (first one found; parsing stops there, same
 * approach as a compiler reporting the first blocking error rather than
 * guessing recovery points past it). */
export function parseDsl(input: string): DslParseResult {
  const tokens = tokenize(input);
  const nodesByName = new Map<string, Node>();
  const order: string[] = [];

  function getOrCreateNode(name: string): Node {
    let n = nodesByName.get(name);
    if (!n) {
      n = newNode(name);
      nodesByName.set(name, n);
      order.push(name);
    }
    return n;
  }
  function addRequires(from: Node, toId: string): void {
    if (from.id !== toId && !from.requires.includes(toId)) from.requires.push(toId);
  }
  function addContains(from: Node, toId: string): void {
    if (from.id !== toId && !from.contains.includes(toId)) from.contains.push(toId);
  }

  let pos = 0;
  const peek = (): Token | undefined => tokens[pos];
  const next = (): Token | undefined => tokens[pos++];
  const endPos = input.length;

  function expectIdent(context: string): Token {
    const t = peek();
    if (!t || t.type !== "IDENT") {
      throw new DslSyntaxError(`${context}にはノード名が必要です`, t?.pos ?? endPos);
    }
    next();
    return t;
  }

  // Consumes `(Arrow Target)*` starting right after `startNode`'s own IDENT
  // has already been consumed by the caller. A Target is either another
  // IDENT (continues the requires-chain) or a `[...]` bracket (attaches to
  // startNode's contains, recursing the same rule inside).
  function continueChain(startNode: Node): void {
    let current = startNode;
    while (peek()?.type === "ARROW") {
      next();
      const t = peek();
      if (!t) throw new DslSyntaxError("'->' の後にノード名または '[' が必要です", endPos);
      if (t.type === "IDENT") {
        next();
        const target = getOrCreateNode(t.value);
        addRequires(current, target.id);
        current = target;
      } else if (t.type === "LBRACKET") {
        next();
        const innerFirstTok = expectIdent("'['");
        const innerFirst = getOrCreateNode(innerFirstTok.value);
        addContains(current, innerFirst.id);
        continueChain(innerFirst);
        const close = peek();
        if (!close || close.type !== "RBRACKET") {
          throw new DslSyntaxError("']' が閉じられていません", close?.pos ?? endPos);
        }
        next();
        // current stays startNode's own current — a bracket is a side
        // branch, not a continuation of the requires-chain.
      } else {
        throw new DslSyntaxError("'->' の後にノード名または '[' が必要です", t.pos);
      }
    }
  }

  function parseChain(): void {
    const first = expectIdent("式の先頭");
    const node = getOrCreateNode(first.value);
    continueChain(node);
  }

  const errors: DslError[] = [];
  try {
    if (tokens.length === 0) {
      throw new DslSyntaxError("入力が空です", 0);
    }
    parseChain();
    while (peek()) {
      const t = peek()!;
      if (t.type === "COMMA") {
        next();
        if (!peek()) throw new DslSyntaxError("',' の後にノード名が必要です", endPos);
        parseChain();
      } else {
        throw new DslSyntaxError(`予期しないトークン: '${t.value}'`, t.pos);
      }
    }
  } catch (err) {
    if (err instanceof DslSyntaxError) {
      errors.push({ message: err.message, pos: err.pos });
    } else {
      throw err;
    }
  }

  if (errors.length > 0) return { nodes: [], errors };

  // A chain's first node (the one nothing else points at via requires/
  // contains) is the intended search entry point, so it gets type:"Goal" —
  // the only type populateBuildSelect() surfaces in the top-left dropdown
  // (item 28/30). Every other generated node is a requires/contains target
  // reached by drilling down from a Goal or Build, so type:"Goal" on it
  // would just be dropdown noise; "Resource" is used as the closest thing to
  // a category-less placeholder in the existing NodeType enum (no dedicated
  // "uncategorized" value exists — see Core Mandate 5 on why this enum isn't
  // extended lightly).
  const referenced = new Set<string>();
  for (const n of nodesByName.values()) {
    for (const r of n.requires) referenced.add(r);
    for (const c of n.contains) referenced.add(c);
  }
  const nodes = order.map((name) => {
    const n = nodesByName.get(name)!;
    n.type = referenced.has(n.id) ? "Resource" : "Goal";
    return n;
  });
  return { nodes, errors };
}
