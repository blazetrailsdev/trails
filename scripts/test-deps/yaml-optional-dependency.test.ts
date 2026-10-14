// Guard: `yaml` is an optional dependency of `@blazetrails/ruby-compat`, so
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
// `@blazetrails/ruby-compat/psych-adapter`, which is why the ruby-compat Psych
// specifiers are followed into their source files rather than treated as
// offenders: `psych-adapter.ts` resolves `yaml` dynamically, so naming the YAML
// coders costs nothing at load time and the miss surfaces where Ruby would
// raise it, from the dump/load call.
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript-5";
import { describe, it, expect } from "vitest";

const PACKAGES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../packages");

const IMPORT_RE =
  /(?:^|\n)\s*(?:(?:import|export)\s+([\s\S]*?)\s*from\s*|import\s+)["']([^"']+)["']/g;

/** The optional package itself — a static import of it is the load-time hazard. */
const YAML_PACKAGE = "yaml";

/**
 * A `@blazetrails/<pkg>` specifier is followed into `<pkg>/src/index.ts`, and
 * `@blazetrails/<pkg>/<sub>` into `<pkg>/src/<sub>.ts`.
 */
const CROSS_PACKAGE_RE = /^@blazetrails\/([^/]+)(?:\/(.+))?$/;

/**
 * Whether `source` awaits outside every function body: an `await` expression
 * or a `for await` reached without crossing a function-like node.
 */
function hasTopLevelAwait(source: string): boolean {
  const visit = (node: ts.Node): boolean => {
    if (ts.isFunctionLike(node) || ts.isClassStaticBlockDeclaration(node)) return false;
    if (ts.isAwaitExpression(node)) return true;
    if (ts.isForOfStatement(node) && node.awaitModifier) return true;
    return ts.forEachChild(node, visit) ?? false;
  };
  return visit(ts.createSourceFile("module.ts", source, ts.ScriptTarget.Latest, false));
}

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
 * statically import `yaml` or hold a top-level `await`. `import type` is erased
 * by tsc and carries no load-time edge.
 */
async function offendersReachableFromIndex(pkg: string): Promise<string[]> {
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
    if (hasTopLevelAwait(source)) offenders.push(`${key(node)} (top-level await)`);
    for (const [, clause, specifier] of source.matchAll(IMPORT_RE)) {
      if (/^\s*type\b/.test(clause ?? "")) continue;
      if (specifier === YAML_PACKAGE) {
        offenders.push(key(node));
        continue;
      }
      const crossPackage = CROSS_PACKAGE_RE.exec(specifier);
      if (crossPackage) {
        const [, name, sub = "index"] = crossPackage;
        const file = `${sub}.ts`;
        if (await exists(path.join(PACKAGES, name, "src", file))) stack.push({ pkg: name, file });
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

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

const ROOTS = (await readdir(PACKAGES, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

describe("yaml optional dependency", () => {
  it.each(ROOTS)("is not reachable from the %s root import", async (pkg) => {
    if (!(await exists(path.join(PACKAGES, pkg, "src", "index.ts")))) return;
    expect(await offendersReachableFromIndex(pkg)).toEqual([]);
  });

  it("detects a top-level await in any position", () => {
    expect(hasTopLevelAwait('const backend = (await import("yaml")).default;')).toBe(true);
    expect(hasTopLevelAwait("export default await getBackend();")).toBe(true);
    expect(hasTopLevelAwait("for await (const x of xs) {}")).toBe(true);
    expect(hasTopLevelAwait("async function f() { await g(); }")).toBe(false);
    expect(hasTopLevelAwait("const f = async () => await g();")).toBe(false);
  });

  it("is imported for its values only by psych-adapter.ts", async () => {
    const importers: string[] = [];
    for (const pkg of ROOTS.filter((name) => name !== "website")) {
      const src = path.join(PACKAGES, pkg, "src");
      if (!(await exists(src))) continue;
      for (const file of await tsFiles(src)) {
        if (`${pkg}/${file}` === "ruby-compat/psych-adapter.ts") continue;
        const source = await readFile(path.join(src, file), "utf8");
        for (const [, clause, specifier] of source.matchAll(IMPORT_RE)) {
          if (specifier === YAML_PACKAGE && !/^\s*type\b/.test(clause ?? ""))
            importers.push(`${pkg}/${file}`);
        }
      }
    }
    expect(importers).toEqual([]);
  });
});
