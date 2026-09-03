/**
 * `@blazetrails/ruby-compat` is a leaf: it holds the Ruby core/stdlib
 * primitives trails calls but Rails does not define, and it must stay usable
 * in a browser bundle with nothing else resolved alongside it. RFC 0129's
 * README and the package's own `description` both say so, and until this guard
 * nothing checked it — the property held by luck.
 *
 * Two halves make it up, and both are only visible in the BUILT output:
 *
 * - No runtime module takes a Node builtin (`node:fs`, `fs`, `fs/promises`, …)
 *   through a specifier a bundler resolves: a static `import` / `export … from`
 *   / `import =`, or a dynamic `import()`.
 * - The package declares no `dependencies` / `peerDependencies`, so no
 *   workspace or third-party edge can drag one in transitively.
 *
 * A `require()` is deliberately NOT a violation, and that is the boundary this
 * guard checks (RFC 0135). The property the leaf actually needs is "a browser
 * bundle of this package resolves nothing outside it and runs" — a static or
 * dynamic specifier is resolved by the bundler, so it breaks that property
 * whatever guards it; a bare `require` is not defined in the ESM output at all,
 * so a call to it only ever runs behind a `typeof require !== "undefined"` /
 * `process.versions.node` check, on a host where the builtin exists. Flagging
 * `require` was checking a proxy for the property rather than the property, and
 * it rejects the platform adapters' Node bootstrap, which is browser-safe.
 * `process.getBuiltinModule("node:crypto")` names no module specifier at all
 * and was never visible here.
 *
 * A `src/**` lint sees neither half: it cannot see a transitive edge at all,
 * and `packages/ruby-compat/src/**` joining the `no-node-builtins` rule only
 * closes the first for this package's own files.
 *
 * There is no exemption. The package's tests compile in their own project
 * (`packages/ruby-compat/tsconfig.test.json`), which is also what fences
 * `@types/node` out of the runtime sources' program — so `dist/` holds only
 * runtime modules and a compiled `vitest` import cannot appear there.
 */

import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";

const NODE_BUILTINS = new Set(builtinModules.filter((m) => !m.startsWith("_")));

/** How a module specifier is written, which is what decides whether it binds. */
export type SpecifierKind = "static" | "dynamic" | "require";

export interface ModuleSpecifier {
  specifier: string;
  kind: SpecifierKind;
}

/**
 * Every module specifier a built module names, in source order — parsed, not
 * pattern-matched, so a side-effect `import "node:fs"`, an `export * from`, an
 * `import type`, a dynamic `import()` and a `require()` all count — each tagged
 * with the kind that decides whether a bundler resolves it.
 */
export function moduleSpecifiers(source: string): ModuleSpecifier[] {
  const sourceFile = ts.createSourceFile("module.js", source, ts.ScriptTarget.ESNext, true);
  const specifiers: ModuleSpecifier[] = [];

  const record = (node: ts.Node | undefined, kind: SpecifierKind): void => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push({ specifier: node.text, kind });
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(node.moduleSpecifier, "static");
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference))
        record(node.moduleReference.expression, "static");
    } else if (ts.isCallExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === "require") {
        record(node.arguments[0], "require");
      } else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        record(node.arguments[0], "dynamic");
      }
    }
    ts.forEachChild(node, visit);
  };

  ts.forEachChild(sourceFile, visit);
  return specifiers;
}

/** The Node builtin a specifier names, or null. Subpaths count: `fs/promises`. */
export function nodeBuiltinNamed(specifier: string): string | null {
  const normalized = specifier.replace(/^node:/, "");
  const base = normalized.includes("/") ? normalized.slice(0, normalized.indexOf("/")) : normalized;
  if (specifier.startsWith("node:")) return base;
  return NODE_BUILTINS.has(base) ? base : null;
}

async function jsFiles(dir: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await jsFiles(path.join(dir, entry.name), rel)));
    else if (entry.name.endsWith(".js")) out.push(rel);
  }
  return out;
}

export interface LeafViolation {
  file: string;
  specifier: string;
  kind: SpecifierKind;
  builtin: string;
}

/**
 * Every bundler-resolved Node-builtin import in the package's built runtime
 * modules. Throws when `dist/` is absent rather than reporting nothing — a
 * guard that passes on an unbuilt tree is a no-op.
 */
export async function nodeBuiltinImports(packageDir: string): Promise<LeafViolation[]> {
  const dist = path.join(packageDir, "dist");
  let files: string[];
  try {
    files = await jsFiles(dist);
  } catch {
    throw new Error(`${dist} is missing — build the package before running this guard.`);
  }
  const violations: LeafViolation[] = [];
  for (const file of files.sort()) {
    const source = await readFile(path.join(dist, file), "utf-8");
    for (const { specifier, kind } of moduleSpecifiers(source)) {
      if (kind === "require") continue;
      const builtin = nodeBuiltinNamed(specifier);
      if (builtin) violations.push({ file, specifier, kind, builtin });
    }
  }
  return violations;
}

/** The dependency fields that would give the leaf a transitive edge. */
export async function declaredDependencies(packageDir: string): Promise<string[]> {
  const manifest = JSON.parse(await readFile(path.join(packageDir, "package.json"), "utf-8")) as
    | Record<string, Record<string, string> | undefined>
    | undefined;
  const declared: string[] = [];
  for (const field of ["dependencies", "peerDependencies"] as const) {
    for (const name of Object.keys(manifest?.[field] ?? {})) declared.push(`${field}: ${name}`);
  }
  return declared;
}
