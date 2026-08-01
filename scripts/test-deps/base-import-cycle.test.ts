// Regression guard: `base.ts` must not be a member of any import cycle.
//
// base.ts wires its Ruby-style mixins (`extend(Base, ConnectionHandling.ClassMethods)`,
// …) in ~40 statements at module-evaluation time. ESM evaluates a cycle
// member's body BEFORE its still-in-progress dependencies' bodies, so as long
// as base.ts sits inside a cycle, whether those statements read initialized
// bindings or hit a temporal dead zone depends entirely on which module the
// import graph happens to be entered through. Adding one unrelated import edge
// elsewhere is enough to flip the entry order and crash the whole package with
// `ReferenceError: Cannot access 'ClassMethods' before initialization`.
//
// Rails has no such hazard: base.rb `extend`s inside the class body and Ruby
// autoload resolves each constant on first reference, so none of these modules
// `require` base.rb. The fix is the same shape — consumers that only need
// `Base` at call time take it from a registration base.ts pushes at the end of
// its own module body, rather than importing base.js for its value.
//
// This test walks the *source* import graph (value imports only — `import type`
// is erased and carries no load-time edge) and asserts nothing base.ts can
// reach imports base.ts back.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const SRC = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../packages/activerecord/src",
);

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;

async function tsFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test-helpers") continue;
      out.push(...(await tsFiles(full)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(path.relative(SRC, full));
    }
  }
  return out;
}

/** Value-import edges (relative, within the package) keyed by source file. */
async function importGraph(): Promise<Map<string, string[]>> {
  const files = await tsFiles(SRC);
  const known = new Set(files);
  const graph = new Map<string, string[]>();
  for (const file of files) {
    const source = await readFile(path.join(SRC, file), "utf8");
    const targets = new Set<string>();
    for (const [, clause, specifier] of source.matchAll(IMPORT_RE)) {
      if (!specifier.startsWith(".")) continue;
      // `import type { X } from` is erased by tsc — no runtime edge.
      if (/^\s*type\b/.test(clause)) continue;
      const target = path
        .normalize(path.join(path.dirname(file), specifier))
        .replace(/\.js$/, ".ts");
      if (known.has(target)) targets.add(target);
    }
    graph.set(file, [...targets]);
  }
  return graph;
}

describe("base.ts import cycle", () => {
  it("is not reachable from anything base.ts imports", async () => {
    const graph = await importGraph();
    const seen = new Set<string>();
    const offenders: string[] = [];
    const stack = [...(graph.get("base.ts") ?? [])];
    while (stack.length > 0) {
      const file = stack.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      const targets = graph.get(file) ?? [];
      if (targets.includes("base.ts")) offenders.push(file);
      stack.push(...targets.filter((t) => t !== "base.ts"));
    }
    expect(offenders.sort()).toEqual([]);
  });
});
