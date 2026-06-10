// Materialize `declare` members into canonical test-helper model source.
//
// The trails-tsc type-virtualization transform (src/type-virtualization)
// splices `declare` members into a model's class bodies at COMPILE TIME —
// it never writes them to disk. AR test files therefore don't see typed
// `topic.replies`, `dev.mentor`, columns, enums, or enum predicates, so
// they reach for `as any` casts everywhere.
//
// This script runs the SAME virtualizer (plus the auto-import + schema
// passes the trails-tsc CLI wires up) and writes the result back into the
// model `.ts` files, baking the declares into source. The models then
// carry their typed surface directly, so the casts can be dropped.
//
// Usage:  pnpm tsx packages/activerecord/scripts/materialize-model-declares.ts [model.ts ...]
// With no args it processes the pilot set below.

import ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { virtualize } from "../src/type-virtualization/virtualize.js";
import { walk, type ClassInfo, type AssociationCall } from "../src/type-virtualization/walker.js";
import { resolveAssociationTarget } from "../src/type-virtualization/resolve-target.js";
import type { SchemaColumnValue } from "../src/type-virtualization/synthesize.js";
import { TEST_SCHEMA } from "../src/test-helpers/test-schema.js";
import type { ColumnSpec, TableSchema } from "../src/test-helpers/define-schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, "../src/test-helpers/models");

// Models proven to materialize typecheck-green. post.ts / author.ts /
// comment.ts are intentionally NOT here: each hits an unresolved-target,
// subclass-loader-override, or `_tableName` gap (see tasks story
// 0014/materialize-declares-rollout) and would write broken declares.
// Pass them explicitly as args once those gaps are fixed.
const PILOT = ["topic.ts", "developer.ts"];

type SchemaColumnsByTable = Record<string, Record<string, SchemaColumnValue>>;

/**
 * Normalize the test `Schema` (legacy `Record<col, ColumnSpec>` and the
 * wrapped `{ columns, primaryKey }` shape) into the
 * `Record<table, Record<col, SchemaColumnValue>>` the virtualizer wants.
 * Array columns are rendered as `Element[]` via `arrayElementType`.
 */
function normalizeSchema(schema: Record<string, TableSchema>): SchemaColumnsByTable {
  const out: SchemaColumnsByTable = {};
  for (const [table, value] of Object.entries(schema)) {
    const cols =
      "columns" in value && "primaryKey" in value
        ? (value.columns as Record<string, ColumnSpec>)
        : (value as Record<string, ColumnSpec>);
    const normalized: Record<string, SchemaColumnValue> = {};
    for (const [col, spec] of Object.entries(cols)) {
      if (typeof spec === "string") {
        normalized[col] = spec;
      } else if (spec.array) {
        normalized[col] = { type: "array", arrayElementType: spec.type, null: spec.null };
      } else {
        normalized[col] = { type: spec.type, null: spec.null };
      }
    }
    out[table] = normalized;
  }
  return out;
}

/** className → absolute source path, for auto-importing association targets. */
function buildModelRegistry(): Map<string, string> {
  const registry = new Map<string, string>();
  for (const entry of fs.readdirSync(MODELS_DIR)) {
    if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
    const file = path.join(MODELS_DIR, entry);
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.ES2022,
      true,
    );
    for (const stmt of sf.statements) {
      if (ts.isClassDeclaration(stmt) && stmt.name && !registry.has(stmt.name.text)) {
        registry.set(stmt.name.text, file);
      }
    }
  }
  return registry;
}

/**
 * Compute the virtualizer `baseNames` allow-list for a single file by
 * walking its in-file `extends` chains to a fixpoint rooted at `Base`.
 * The pilot models keep every subclass (e.g. `SpecialComment extends
 * Comment`) in the same file, so no cross-file resolution is needed.
 */
function computeBaseNames(sf: ts.SourceFile): string[] {
  const parentOf = new Map<string, string>();
  for (const stmt of sf.statements) {
    if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
    for (const hc of stmt.heritageClauses ?? []) {
      if (hc.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      const expr = hc.types[0]?.expression;
      if (expr && ts.isIdentifier(expr)) parentOf.set(stmt.name.text, expr.text);
    }
  }
  const names = new Set<string>(["Base"]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const [child, parent] of parentOf) {
      if (names.has(parent) && !names.has(child)) {
        names.add(child);
        grew = true;
      }
    }
  }
  return [...names];
}

/**
 * `import type { Target }` lines for association targets referenced by a
 * synthesized declare that aren't already in scope. Mirrors the CLI's
 * `resolveAutoImports`, reimplemented here against the source walker so
 * the script needs no built `dist/`.
 */
function resolveAutoImports(
  sf: ts.SourceFile,
  fileName: string,
  registry: ReadonlyMap<string, string>,
  baseNames: readonly string[],
): string[] {
  const classes = walk(sf, { baseNames });
  const needed = new Set<string>();
  for (const info of classes) collectTargets(info, needed);
  if (needed.size === 0) return [];
  const inScope = collectNamesInScope(sf);
  const imports: string[] = [];
  for (const name of needed) {
    if (inScope.has(name)) continue;
    const target = registry.get(name);
    if (!target) continue;
    let rel = path.relative(path.dirname(fileName), target).replace(/\\/g, "/");
    if (!rel.startsWith(".")) rel = "./" + rel;
    rel = rel.replace(/\.tsx?$/, ".js");
    imports.push(`import type { ${name} } from "${rel}";`);
  }
  return imports.sort((a, b) => a.localeCompare(b));
}

function collectTargets(info: ClassInfo, out: Set<string>): void {
  for (const call of info.calls) {
    if (
      call.kind !== "hasMany" &&
      call.kind !== "hasAndBelongsToMany" &&
      call.kind !== "belongsTo" &&
      call.kind !== "hasOne"
    )
      continue;
    const assoc = call as AssociationCall;
    if (call.kind === "belongsTo" && assoc.options["polymorphic"] === "true") continue;
    out.add(resolveAssociationTarget(assoc));
  }
}

function collectNamesInScope(sf: ts.SourceFile): Set<string> {
  const names = new Set<string>();
  for (const stmt of sf.statements) {
    if (ts.isImportDeclaration(stmt) && stmt.importClause) {
      const clause = stmt.importClause;
      if (clause.name) names.add(clause.name.text);
      const named = clause.namedBindings;
      if (named && ts.isNamedImports(named))
        for (const el of named.elements) names.add(el.name.text);
      else if (named && ts.isNamespaceImport(named)) names.add(named.name.text);
      continue;
    }
    if (
      (ts.isClassDeclaration(stmt) ||
        ts.isInterfaceDeclaration(stmt) ||
        ts.isTypeAliasDeclaration(stmt) ||
        ts.isEnumDeclaration(stmt)) &&
      stmt.name
    )
      names.add(stmt.name.text);
  }
  return names;
}

// The virtualizer qualifies its built-in generic types with inline
// `import("…").X` expressions so it never has to touch a user file's
// import list (that's correct for a compile-time transform). When we
// MATERIALIZE the output into source we'd rather read normal top-level
// imports, so this pass rewrites every `import("mod").Sym` to a bare
// `Sym` and hoists one `import type { … } from "mod"` line per module.
//
// Symbols already in scope (e.g. a model that already imports `Relation`,
// or `Temporal` imported as a value) are reused — no duplicate import.
// AR built-ins are pointed at the same relative paths the hand-written
// model declares use, to match convention; anything else keeps its
// original module specifier.
const INLINE_IMPORT_RE = /import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)/g;
const BUILTIN_IMPORT_SPECIFIER: Record<string, string> = {
  AssociationProxy: "../../associations/collection-proxy.js",
  Relation: "../../relation.js",
  IPAddr: "../../connection-adapters/postgresql/oid/cidr.js",
};

function hoistInlineImports(
  text: string,
  inScope: ReadonlySet<string>,
): { text: string; importLines: string[] } {
  const bySpecifier = new Map<string, Set<string>>();
  const rewritten = text.replace(INLINE_IMPORT_RE, (_match, mod: string, sym: string) => {
    if (!inScope.has(sym)) {
      const specifier = BUILTIN_IMPORT_SPECIFIER[sym] ?? mod;
      (bySpecifier.get(specifier) ?? bySpecifier.set(specifier, new Set()).get(specifier)!).add(
        sym,
      );
    }
    return sym;
  });
  const importLines = [...bySpecifier]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([specifier, syms]) => `import type { ${[...syms].sort().join(", ")} } from "${specifier}";`,
    );
  return { text: rewritten, importLines };
}

function main(): void {
  const args = process.argv.slice(2);
  const targets = (args.length > 0 ? args.map((a) => path.basename(a)) : PILOT).map((f) =>
    path.join(MODELS_DIR, f),
  );
  const schemaColumnsByTable = normalizeSchema(TEST_SCHEMA);
  const registry = buildModelRegistry();

  for (const file of targets) {
    const source = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
    const baseNames = computeBaseNames(sf);
    const prependImports = resolveAutoImports(sf, file, registry, baseNames);
    const { text: virtualized } = virtualize(source, file, {
      baseNames,
      prependImports,
      schemaColumnsByTable,
    });
    if (virtualized === source) {
      process.stdout.write(`  unchanged ${path.basename(file)}\n`);
      continue;
    }
    // Rewrite the virtualizer's inline `import("…").X` type expressions
    // into bare references + hoisted top-level `import type` lines.
    const { text: hoisted, importLines } = hoistInlineImports(virtualized, collectNamesInScope(sf));
    const text = importLines.length > 0 ? importLines.join("\n") + "\n" + hoisted : hoisted;
    fs.writeFileSync(file, text);
    const added = text.split("\n").length - source.split("\n").length;
    process.stdout.write(`  materialized ${path.basename(file)} (+${added} lines)\n`);
  }
}

main();
