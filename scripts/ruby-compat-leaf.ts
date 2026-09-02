/**
 * `@blazetrails/ruby-compat` is a leaf: it holds the Ruby core/stdlib
 * primitives trails calls but Rails does not define, and it must stay usable
 * in a browser bundle with nothing else resolved alongside it. RFC 0129's
 * README and the package's own `description` both say so, and until this guard
 * nothing checked it — the property held by luck.
 *
 * Two halves make it up, and both are only visible in the BUILT output:
 *
 * - No runtime module imports a Node builtin (`node:fs`, `fs`, `fs/promises`,
 *   …), by static import, dynamic import or `require`.
 * - The package declares no `dependencies` / `peerDependencies`, so no
 *   workspace or third-party edge can drag one in transitively.
 *
 * A `src/**` lint sees neither: it cannot see a transitive edge at all, and
 * `packages/ruby-compat/src/**` joining the `no-node-builtins` rule only closes
 * the first half for this package's own files.
 *
 * Compiled test files are the one exemption — they import `vitest`, which is a
 * devDependency of the workspace root and never ships.
 */

import { readdir, readFile } from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import ts from "typescript";

const NODE_BUILTINS = new Set(builtinModules.filter((m) => !m.startsWith("_")));

/** A compiled test file — the one exemption; it imports `vitest`. */
export function isCompiledTestFile(rel: string): boolean {
  return /\.test\.js$/.test(rel);
}

/**
 * Every module specifier a built module names, in source order — parsed, not
 * pattern-matched, so a side-effect `import "node:fs"`, an `export * from`, an
 * `import type`, a dynamic `import()` and a `require()` all count.
 */
export function moduleSpecifiers(source: string): string[] {
  const sourceFile = ts.createSourceFile("module.js", source, ts.ScriptTarget.ESNext, true);
  const specifiers: string[] = [];

  const record = (node: ts.Node | undefined): void => {
    if (node && ts.isStringLiteralLike(node)) specifiers.push(node.text);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      record(node.moduleSpecifier);
    } else if (ts.isImportEqualsDeclaration(node)) {
      if (ts.isExternalModuleReference(node.moduleReference))
        record(node.moduleReference.expression);
    } else if (ts.isCallExpression(node)) {
      const isRequire = ts.isIdentifier(node.expression) && node.expression.text === "require";
      if (isRequire || node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        record(node.arguments[0]);
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
  builtin: string;
}

/**
 * Every Node-builtin import in the package's built runtime modules. Throws when
 * `dist/` is absent rather than reporting nothing — a guard that passes on an
 * unbuilt tree is a no-op.
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
    if (isCompiledTestFile(file)) continue;
    const source = await readFile(path.join(dist, file), "utf-8");
    for (const specifier of moduleSpecifiers(source)) {
      const builtin = nodeBuiltinNamed(specifier);
      if (builtin) violations.push({ file, specifier, builtin });
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
