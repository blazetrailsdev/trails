// Guard: `yaml` is an optional dependency of `@blazetrails/activesupport`, so
// nothing reachable from a package's `index.ts` may statically import it.
//
// Rails has no counterpart to this — Psych is stdlib, `require "yaml"` never
// fails, and `active_record.rb:31` / `coders/yaml_column.rb:3` require it
// unconditionally. In trails `yaml` is an npm package a consumer may
// legitimately omit, and ESM static imports are eager: one
// `export … from "yaml"` on a path reachable from `index.ts` turns every
// `import "@blazetrails/<pkg>"` into a hard `ERR_MODULE_NOT_FOUND`.
//
// Measured blast radius before this guard covered them: the root imports of
// `@blazetrails/activesupport` and `@blazetrails/activemodel` resolved, but the
// root imports of `@blazetrails/activerecord` (via `base.ts` →
// `coders/yaml-column.ts`) and `@blazetrails/actionview` (via
// `helpers/index.ts` → `debug-helper.ts`) did not. Both reach
// `@blazetrails/activesupport/yaml`, which is why that specifier is followed
// into `activesupport/src/yaml.ts` rather than treated as an offender: that
// module resolves `yaml` dynamically, so naming the YAML coders costs nothing
// at load time and the miss surfaces where Ruby would raise it, from the
// dump/load call.
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)\s+([\s\S]*?)\s*from\s*["']([^"']+)["']/g;

/** The optional package itself — a static import of it is the load-time hazard. */
const YAML_PACKAGE = "yaml";

/** Cross-package specifier followed as a graph edge into its source file. */
const CROSS_PACKAGE_EDGES = new Map([
  ["@blazetrails/activesupport/yaml", { pkg: "activesupport", file: "yaml.ts" }],
]);

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

type Node = { pkg: string; file: string };

const key = (node: Node): string => `${node.pkg}/src/${node.file}`;

/**
 * Files reachable from `<pkg>/src/index.ts` over value-import edges that
 * statically import `yaml`. `import type` is erased by tsc and carries no
 * load-time edge.
 */
async function yamlImportersReachableFromIndex(pkg: string): Promise<string[]> {
  const known = new Map<string, Set<string>>();
  const filesOf = async (name: string): Promise<Set<string>> => {
    let files = known.get(name);
    if (!files) {
      files = new Set(await tsFiles(path.join(PACKAGES, name, "src")));
      known.set(name, files);
    }
    return files;
  };

  const seen = new Set<string>();
  const offenders: string[] = [];
  const stack: Node[] = [{ pkg, file: "index.ts" }];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (seen.has(key(node))) continue;
    seen.add(key(node));

    const source = await readFile(path.join(PACKAGES, node.pkg, "src", node.file), "utf8");
    for (const [, clause, specifier] of source.matchAll(IMPORT_RE)) {
      if (/^\s*type\b/.test(clause)) continue;
      if (specifier === YAML_PACKAGE) {
        offenders.push(key(node));
        continue;
      }
      const crossPackage = CROSS_PACKAGE_EDGES.get(specifier);
      if (crossPackage) {
        stack.push(crossPackage);
        continue;
      }
      if (!specifier.startsWith(".")) continue;
      const file = path
        .normalize(path.join(path.dirname(node.file), specifier))
        .replace(/\.js$/, ".ts");
      if ((await filesOf(node.pkg)).has(file)) stack.push({ pkg: node.pkg, file });
    }
  }
  return [...new Set(offenders)].sort();
}

describe("yaml optional dependency", () => {
  it("is not reachable from the activesupport root import", async () => {
    expect(await yamlImportersReachableFromIndex("activesupport")).toEqual([]);
  });

  it("is not reachable from the activemodel root import", async () => {
    expect(await yamlImportersReachableFromIndex("activemodel")).toEqual([]);
  });

  it("is not reachable from the activerecord root import", async () => {
    expect(await yamlImportersReachableFromIndex("activerecord")).toEqual([]);
  });

  it("is not reachable from the actionview root import", async () => {
    expect(await yamlImportersReachableFromIndex("actionview")).toEqual([]);
  });
});
