// Guard: `yaml` is an optional dependency of `@blazetrails/activesupport`, so
// nothing reachable from that package's `index.ts` may import it.
//
// Rails has no counterpart to this — Psych is stdlib, `require "yaml"` never
// fails, and `active_support.rb` can name YAML freely. In trails `yaml` is an
// npm package a consumer may legitimately omit, and ESM static imports are
// eager: one `export … from "./yaml.js"` in `index.ts` would turn every
// `import "@blazetrails/activesupport"` into a hard `ERR_MODULE_NOT_FOUND`.
// The YAML surface is reachable only through the `./yaml` and
// `./configuration-file` subpath exports, and this test pins that.
//
// Measured blast radius with `yaml` uninstalled (see the PR that added this
// file): the root imports of `@blazetrails/activesupport` and
// `@blazetrails/activemodel` resolve; the root imports of
// `@blazetrails/activerecord` (via `base.ts` → `coders/yaml-column.ts`) and
// `@blazetrails/actionview` (via `helpers/index.ts` → `debug-helper.ts`) do
// not. Those two edges are debt to converge, not a settled shape.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;

/** Specifiers whose resolution needs the optional `yaml` package installed. */
const YAML_SPECIFIERS = new Set(["yaml", "@blazetrails/activesupport/yaml"]);

async function tsFiles(dir: string, root = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await tsFiles(full, root)));
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(path.relative(root, full));
    }
  }
  return out;
}

/**
 * Files reachable from `<pkg>/src/index.ts` over value-import edges that import
 * `yaml`. `import type` is erased by tsc and carries no load-time edge.
 */
async function yamlImportersReachableFromIndex(pkg: string): Promise<string[]> {
  const src = path.join(PACKAGES, pkg, "src");
  const files = await tsFiles(src);
  const known = new Set(files);
  const graph = new Map<string, string[]>();
  const importsYaml = new Set<string>();
  for (const file of files) {
    const source = await readFile(path.join(src, file), "utf8");
    const targets = new Set<string>();
    for (const [, clause, specifier] of source.matchAll(IMPORT_RE)) {
      if (/^\s*type\b/.test(clause)) continue;
      if (YAML_SPECIFIERS.has(specifier)) importsYaml.add(file);
      if (!specifier.startsWith(".")) continue;
      const target = path
        .normalize(path.join(path.dirname(file), specifier))
        .replace(/\.js$/, ".ts");
      if (known.has(target)) targets.add(target);
    }
    graph.set(file, [...targets]);
  }

  const seen = new Set<string>();
  const offenders: string[] = [];
  const stack = ["index.ts"];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (importsYaml.has(file)) offenders.push(file);
    stack.push(...(graph.get(file) ?? []));
  }
  return offenders.sort();
}

describe("yaml optional dependency", () => {
  it("is not reachable from the activesupport root import", async () => {
    expect(await yamlImportersReachableFromIndex("activesupport")).toEqual([]);
  });

  it("is not reachable from the activemodel root import", async () => {
    expect(await yamlImportersReachableFromIndex("activemodel")).toEqual([]);
  });
});
