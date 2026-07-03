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
import { classify, camelize } from "@blazetrails/activesupport";
import { virtualize } from "../src/type-virtualization/virtualize.js";
import { walk, type ClassInfo, type AssociationCall } from "../src/type-virtualization/walker.js";
import {
  resolveAssociationTarget,
  resolveThroughTarget,
  stripQuotes,
  type ModelAssociationLookup,
} from "../src/type-virtualization/resolve-target.js";
import type { SchemaColumnValue } from "../src/type-virtualization/synthesize.js";
import type { TableSchema, WrappedTableSchema } from "../src/test-helpers/define-schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, "../src/test-helpers/models");

// Default pilot set processed with no args. Bulk roll-out (baking declares
// into every canonical model) is a separate story; the through-target and
// subclass-loader gaps that broke post.ts/author.ts/comment.ts are fixed
// (see `resolveThroughTarget` + ancestor-aware loader overloads), so those
// three now materialize green when passed explicitly.
const PILOT = ["topic.ts", "developer.ts"];

type SchemaColumnsByTable = Record<string, Record<string, SchemaColumnValue>>;

/**
 * Normalize the test `Schema` (legacy `Record<col, ColumnSpec>` and the
 * wrapped `{ columns, primaryKey }` shape) into the
 * `Record<table, Record<col, SchemaColumnValue>>` the virtualizer wants.
 * Array columns are rendered as `Element[]` via `arrayElementType`.
 */
function normalizeSchema(
  schema: Record<string, TableSchema>,
  isWrappedSchema: (table: TableSchema) => table is WrappedTableSchema,
): SchemaColumnsByTable {
  const out: SchemaColumnsByTable = {};
  for (const [table, value] of Object.entries(schema)) {
    // Discriminate the wrapped `{ columns, primaryKey?, indexes? }` shape from
    // the legacy `Record<col, ColumnSpec>` map using the canonical helper. The
    // earlier `"columns" in value && "primaryKey" in value` check missed
    // wrappers that carry `indexes` but no `primaryKey` (e.g. `books`), so it
    // fell through and emitted `columns`/`indexes` as bogus column names.
    const cols = isWrappedSchema(value) ? value.columns : value;
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
 * Build a map from Ruby-qualified class names ("Module::Class") to the TS
 * class identifier, by scanning model files for `static moduleName` and
 * `static _demodulizedName` on each class. Used to resolve namespaced
 * `className:` values like `"Namespaced::Client"` → `NamespacedClient`.
 */
function buildNamespacedClassRegistry(registry: ReadonlyMap<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  const seen = new Set<string>();
  for (const [, file] of registry) {
    if (seen.has(file)) continue;
    seen.add(file);
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.ES2022,
      true,
    );
    for (const stmt of sf.statements) {
      if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
      const tsName = stmt.name.text;
      let moduleName: string | undefined;
      let demodulizedName: string | undefined;
      for (const m of stmt.members) {
        if (!ts.isPropertyDeclaration(m) || !m.initializer) continue;
        if (!ts.isIdentifier(m.name) && !ts.isStringLiteralLike(m.name)) continue;
        const prop = ts.isIdentifier(m.name) ? m.name.text : m.name.text;
        if (!ts.isStringLiteralLike(m.initializer)) continue;
        if (prop === "moduleName") moduleName = m.initializer.text;
        else if (prop === "_demodulizedName") demodulizedName = m.initializer.text;
      }
      if (moduleName) {
        const baseName = demodulizedName ?? tsName;
        const qualified = `${moduleName}::${baseName}`;
        if (!out.has(qualified)) out.set(qualified, tsName);
      }
    }
  }
  return out;
}

/**
 * Resolve a Ruby-style "Module::Class" className to the TS class identifier.
 * Tries exact match first, then a suffix match for relative namespaces
 * (e.g. "Nested::Firm" matches any qualified name ending "::Nested::Firm").
 */
function resolveNamespacedClassName(
  name: string,
  namespacedRegistry: ReadonlyMap<string, string>,
): string | undefined {
  const exact = namespacedRegistry.get(name);
  if (exact) return exact;
  const suffix = `::${name}`;
  for (const [qualified, tsName] of namespacedRegistry) {
    if (qualified.endsWith(suffix)) return tsName;
  }
  return undefined;
}

/**
 * Extend the per-file alias map with:
 *  - Gap A: resolutions for Ruby-namespaced `className:` values ("A::B" → TsName)
 *  - Gap B: classify-correction aliases when classify(assocName) isn't in the
 *    TS class registry (e.g. "iris" → classify → "Iri", camelize → "Iris")
 */
function buildExtendedAliases(
  sf: ts.SourceFile,
  baseAliases: ReadonlyMap<string, string>,
  isModelClass: (cls: ts.ClassDeclaration) => boolean,
  registry: ReadonlyMap<string, string>,
  namespacedRegistry: ReadonlyMap<string, string>,
): Map<string, string> {
  const out = new Map(baseAliases);
  for (const info of walk(sf, { isModelClass })) {
    for (const call of info.calls) {
      if (
        call.kind !== "hasMany" &&
        call.kind !== "hasAndBelongsToMany" &&
        call.kind !== "belongsTo" &&
        call.kind !== "hasOne"
      )
        continue;
      const rawClassName = call.options["className"];
      if (rawClassName) {
        // Gap A: resolve "Namespace::Class" to TS class name.
        // If unresolvable, omit the alias so the synthesizer skips the declare
        // (no entry → resolveAssociationTarget returns undefined → no emit).
        // Rails raises on a bad class name; we should not bake Base as a fallback.
        const stripped = stripQuotes(rawClassName);
        if (stripped.includes("::") && !out.has(stripped)) {
          const tsName = resolveNamespacedClassName(stripped, namespacedRegistry);
          if (tsName) out.set(stripped, tsName);
        }
      } else {
        // Gap B: fix mis-singularized classify results
        const classified = classify(call.name);
        if (!registry.has(classified) && !out.has(classified)) {
          const cam = camelize(call.name);
          if (registry.has(cam) && cam !== classified) out.set(classified, cam);
        }
      }
    }
  }
  return out;
}

/**
 * Extract the DB column names consumed by `composedOf(this, name, { mapping })` calls
 * in static blocks, keyed by class name. These columns should be excluded from
 * schema-reflected `declare` lines to avoid conflicting with the aggregation type.
 */
function extractComposedOfColumns(sf: ts.SourceFile): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const visitClass = (cls: ts.ClassDeclaration): void => {
    if (!cls.name) return;
    const className = cls.name.text;
    for (const member of cls.members) {
      if (!ts.isClassStaticBlockDeclaration(member)) continue;
      for (const stmt of member.body.statements) {
        if (!ts.isExpressionStatement(stmt)) continue;
        const call = stmt.expression;
        if (!ts.isCallExpression(call)) continue;
        if (!ts.isIdentifier(call.expression) || call.expression.text !== "composedOf") continue;
        // composedOf(this, name, { ..., mapping: [[col, method], ...] })
        const [, , optsArg] = call.arguments;
        if (!optsArg || !ts.isObjectLiteralExpression(optsArg)) continue;
        for (const prop of optsArg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          if (!ts.isIdentifier(prop.name) || prop.name.text !== "mapping") continue;
          const mapping = prop.initializer;
          if (!ts.isArrayLiteralExpression(mapping)) continue;
          for (const pair of mapping.elements) {
            if (!ts.isArrayLiteralExpression(pair) || pair.elements.length < 1) continue;
            const colArg = pair.elements[0];
            if (!colArg || !ts.isStringLiteralLike(colArg)) continue;
            const cols = out.get(className) ?? new Set<string>();
            cols.add(colArg.text);
            out.set(className, cols);
          }
        }
      }
    }
  };
  const visit = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node)) visitClass(node);
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

const ASSOC_KINDS = new Set<string>(["hasMany", "hasAndBelongsToMany", "belongsTo", "hasOne"]);

function associationCalls(info: ClassInfo): AssociationCall[] {
  return info.calls.filter((c): c is AssociationCall => ASSOC_KINDS.has(c.kind));
}

/** The `extends X` superclass identifier of a class declaration, if any. */
function superClassNameOf(cls: ts.ClassDeclaration): string | undefined {
  for (const hc of cls.heritageClauses ?? []) {
    if (hc.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    const expr = hc.types[0]?.expression;
    if (expr && ts.isIdentifier(expr)) return expr.text;
  }
  return undefined;
}

/**
 * Build a global class-name → direct-superclass-name map from all registered
 * model files, mirroring `buildInheritance` but across file boundaries. Used
 * to thread into the virtualizer so cross-file subtype relationships are
 * recognized during conflict suppression (prevents conservatively dropping a
 * correct narrowed declare when the target's superclass lives in another file).
 */
function buildGlobalSuperNameOf(registry: ReadonlyMap<string, string>): Map<string, string> {
  const result = new Map<string, string>();
  const walkedFiles = new Set<string>();
  for (const [, file] of registry) {
    if (walkedFiles.has(file)) continue;
    walkedFiles.add(file);
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.ES2022,
      true,
    );
    for (const stmt of sf.statements) {
      if (!ts.isClassDeclaration(stmt) || !stmt.name) continue;
      const superName = superClassNameOf(stmt);
      if (superName && !result.has(stmt.name.text)) result.set(stmt.name.text, superName);
    }
  }
  return result;
}

/**
 * Cross-file lookup of a model's association calls by class name (parse each
 * registered file on demand, cached) for `resolveThroughTarget`. Walks ALL
 * classes since a through target may be an STI subclass.
 *
 * The lookup is inheritance-aware: a class's calls include those of its
 * ancestor chain, because Rails source reflections resolve against the whole
 * class hierarchy. An STI subclass used as a `through` target — `SpecialPost`
 * / `StiPost` (source `comments` on `Post`), `SelectedMembership` (source
 * `club` on `Membership`), or `SpecialComment` (through `post` on `Comment`) —
 * carries no association calls of its own, so without merging the parent's the
 * source reflection is unresolvable and the declare degrades to `Base`.
 * Subclass calls come first so an override wins the `.find` in
 * `resolveThroughTarget`.
 */
function buildModelAssociationLookup(
  registry: ReadonlyMap<string, string>,
): ModelAssociationLookup {
  const ownByClassName = new Map<string, AssociationCall[] | null>();
  const superByClassName = new Map<string, string | undefined>();
  const walkedFiles = new Set<string>();
  const mergedCache = new Map<string, AssociationCall[] | null>();

  const ensureWalked = (className: string): void => {
    if (ownByClassName.has(className)) return;
    const file = registry.get(className);
    if (!file) {
      ownByClassName.set(className, null);
      return;
    }
    if (walkedFiles.has(file)) return;
    walkedFiles.add(file);
    const sf = ts.createSourceFile(
      file,
      fs.readFileSync(file, "utf8"),
      ts.ScriptTarget.ES2022,
      true,
    );
    for (const info of walk(sf, { isModelClass: () => true })) {
      if (!ownByClassName.has(info.name)) {
        ownByClassName.set(info.name, associationCalls(info));
        superByClassName.set(info.name, superClassNameOf(info.classDecl));
      }
    }
  };

  const merged = (className: string, seen: Set<string>): AssociationCall[] | null => {
    const cached = mergedCache.get(className);
    if (cached !== undefined) return cached;
    if (seen.has(className)) return null; // guard cyclic `extends` chains
    seen.add(className);
    ensureWalked(className);
    const own = ownByClassName.get(className);
    if (own == null) {
      mergedCache.set(className, null);
      return null;
    }
    const superName = superByClassName.get(className);
    const inherited = superName ? merged(superName, seen) : null;
    const result = inherited && inherited.length > 0 ? [...own, ...inherited] : own;
    mergedCache.set(className, result);
    return result;
  };

  return (className) => merged(className, new Set()) ?? undefined;
}

/**
 * Resolve every `through:` association on the file's models to its source
 * class, keyed `"<ClassName>#<assocName>"`. Unresolvable chains fall back to
 * `Base` (always in scope) — keeps output green.
 */
function buildAssociationTargets(
  modelClasses: readonly ClassInfo[],
  lookup: ModelAssociationLookup,
  aliases: ReadonlyMap<string, string>,
): Map<string, string> {
  const targets = new Map<string, string>();
  for (const info of modelClasses) {
    const own = associationCalls(info);
    // Resolve `through:` against the class's inheritance-merged association
    // set so a subclass whose `through` target is an INHERITED association
    // (e.g. `SpecialComment.has_one :author, through: :post`, where `post` is
    // `Comment`'s `belongs_to`) finds it instead of degrading to `Base`.
    const defining = lookup(info.name) ?? own;
    for (const call of own) {
      if (!call.options["through"]) continue;
      const resolved = resolveThroughTarget(defining, call, lookup, aliases) ?? "Base";
      targets.set(`${info.name}#${call.name}`, resolved);
    }
  }
  return targets;
}

/**
 * Compute the set of class-declaration NODES in a file that transitively
 * extend `Base`, resolving each `extends X` to the lexically-nearest
 * in-scope `class X` — the source-walker analogue of the CLI's
 * checker-backed `collectBaseDescendants`.
 *
 * Per-node (rather than per-name) is required because classes are visited
 * at every nesting depth: two `class Foo extends Bar` in sibling
 * `describe`/`it` scopes share the name `Foo` but may resolve `Bar` to
 * different declarations, so a flat name allow-list would let a
 * sibling-scope subclass contaminate another model's inheritance chain.
 * Lexical resolution mirrors how Ruby constant lookup would scope each
 * superclass reference.
 */
function collectModelClassNodes(sf: ts.SourceFile): Set<ts.ClassDeclaration> {
  const rootNames = new Set(["Base"]);
  const memo = new Map<ts.ClassDeclaration, boolean>();
  const all: ts.ClassDeclaration[] = [];
  const collect = (node: ts.Node): void => {
    if (ts.isClassDeclaration(node) && node.name) all.push(node);
    ts.forEachChild(node, collect);
  };
  collect(sf);

  const isBaseDescendant = (cls: ts.ClassDeclaration): boolean => {
    const cached = memo.get(cls);
    if (cached !== undefined) return cached;
    memo.set(cls, false); // tentative, breaks cycles
    for (const hc of cls.heritageClauses ?? []) {
      if (hc.token !== ts.SyntaxKind.ExtendsKeyword) continue;
      for (const t of hc.types) {
        const expr = t.expression;
        if (!ts.isIdentifier(expr)) continue;
        if (rootNames.has(expr.text)) {
          memo.set(cls, true);
          return true;
        }
        const parent = resolveLexicalClass(cls, expr.text);
        if (parent && isBaseDescendant(parent)) {
          memo.set(cls, true);
          return true;
        }
      }
    }
    return false;
  };

  const out = new Set<ts.ClassDeclaration>();
  for (const cls of all) if (isBaseDescendant(cls)) out.add(cls);
  return out;
}

/**
 * The class declaration named `name` that is lexically visible from `from`:
 * declared in the same block/source file or an enclosing block/function
 * body. Returns the nearest match, mirroring constant scoping.
 */
function resolveLexicalClass(from: ts.Node, name: string): ts.ClassDeclaration | undefined {
  for (let n: ts.Node | undefined = from.parent; n; n = n.parent) {
    const statements = ts.isSourceFile(n)
      ? n.statements
      : ts.isBlock(n) || ts.isModuleBlock(n)
        ? n.statements
        : undefined;
    if (!statements) continue;
    for (const stmt of statements) {
      if (ts.isClassDeclaration(stmt) && stmt.name?.text === name) return stmt;
    }
  }
  return undefined;
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
  isModelClass: (cls: ts.ClassDeclaration) => boolean,
  aliases: ReadonlyMap<string, string>,
  associationTargets: ReadonlyMap<string, string>,
): string[] {
  const classes = walk(sf, { isModelClass });
  const moduleScope = collectNamesInScope(sf);
  const imports = new Map<string, string>();
  for (const info of classes) {
    const needed = new Set<string>();
    collectTargets(info, needed, aliases, associationTargets);
    if (needed.size === 0) continue;
    // A declare spliced into THIS class can only reference a bare
    // `Target` that is lexically visible from the class — module-scope
    // imports/decls plus in-file classes declared in the same or an
    // enclosing `describe`/`it`/function body. A same-named class in a
    // sibling callback is NOT visible, so we must still emit the
    // model-registry `import type` for it (and conversely, never emit a
    // dead import for a target that IS visible). `collectNamesInScope`
    // covers only module scope, so add the lexically-visible classes.
    const visible = new Set(moduleScope);
    collectVisibleClassNames(info.classDecl, visible);
    for (const name of needed) {
      if (visible.has(name)) continue;
      const target = registry.get(name);
      if (!target) continue;
      let rel = path.relative(path.dirname(fileName), target).replace(/\\/g, "/");
      if (!rel.startsWith(".")) rel = "./" + rel;
      rel = rel.replace(/\.tsx?$/, ".js");
      imports.set(name, `import type { ${name} } from "${rel}";`);
    }
  }
  return [...imports.values()].sort((a, b) => a.localeCompare(b));
}

/**
 * Add the names of every class declaration lexically visible from `node`:
 * those declared in the same block/source file and in each enclosing
 * block/function body. This is the scope from which a `declare` spliced
 * into `node`'s class body can reference a bare class name.
 */
function collectVisibleClassNames(node: ts.Node, out: Set<string>): void {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    const statements = ts.isSourceFile(n)
      ? n.statements
      : ts.isBlock(n) || ts.isModuleBlock(n)
        ? n.statements
        : undefined;
    if (!statements) continue;
    for (const stmt of statements) {
      if (ts.isClassDeclaration(stmt) && stmt.name) out.add(stmt.name.text);
    }
  }
}

function collectTargets(
  info: ClassInfo,
  out: Set<string>,
  aliases: ReadonlyMap<string, string>,
  associationTargets: ReadonlyMap<string, string>,
): void {
  for (const call of info.calls) {
    if (
      call.kind !== "hasMany" &&
      call.kind !== "hasAndBelongsToMany" &&
      call.kind !== "belongsTo" &&
      call.kind !== "hasOne"
    )
      continue;
    if (call.kind === "belongsTo" && call.options["polymorphic"] === "true") continue;
    // Import the pre-resolved `through:` source class, not classify-of-name.
    const override = associationTargets.get(`${info.name}#${call.name}`);
    if (override) {
      out.add(override);
      continue;
    }
    const target = resolveAssociationTarget(call);
    out.add(aliases.get(target) ?? target);
  }
}

/**
 * Build the association-`className` → in-file class-name alias map from the
 * file's `registerModel("Alias", LocalClass)` calls (at any nesting depth).
 * Test models routinely register under an alias that differs from the class
 * identifier; without this map an association `className: "EsOctopus"` would
 * emit `declare octopus: EsOctopus | null`, a type that does not exist.
 */
function buildClassNameAliases(sf: ts.SourceFile): Map<string, string> {
  const aliases = new Map<string, string>();
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "registerModel"
    ) {
      const [nameArg, classArg] = node.arguments;
      if (
        nameArg &&
        ts.isStringLiteralLike(nameArg) &&
        classArg &&
        ts.isIdentifier(classArg) &&
        nameArg.text !== classArg.text
      ) {
        aliases.set(nameArg.text, classArg.text);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return aliases;
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
// AR built-ins, keyed by symbol → the source module relative to MODELS_DIR
// (the same paths the hand-written model declares under that dir use). The
// specifier is recomputed relative to each materialized file's directory in
// `hoistInlineImports`, so files outside MODELS_DIR (e.g. test files) get a
// correct relative path rather than the model-dir-relative one.
const BUILTIN_IMPORT_FROM_MODELS_DIR: Record<string, string> = {
  AssociationProxy: "../../associations/collection-proxy.js",
  Relation: "../../relation.js",
  IPAddr: "../../connection-adapters/postgresql/oid/cidr.js",
};

/** Builtin specifier recomputed relative to `fileDir`. */
function builtinSpecifierFor(sym: string, fileDir: string): string | undefined {
  const fromModels = BUILTIN_IMPORT_FROM_MODELS_DIR[sym];
  if (!fromModels) return undefined;
  const abs = path.resolve(MODELS_DIR, fromModels);
  let rel = path.relative(fileDir, abs).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

function hoistInlineImports(
  text: string,
  inScope: ReadonlySet<string>,
  fileDir: string,
): { text: string; importLines: string[] } {
  const bySpecifier = new Map<string, Set<string>>();
  const rewritten = text.replace(INLINE_IMPORT_RE, (_match, mod: string, sym: string) => {
    if (!inScope.has(sym)) {
      const specifier = builtinSpecifierFor(sym, fileDir) ?? mod;
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

/**
 * Splice hoisted `import type` lines into `text` just before the first
 * existing top-level `import` statement, so they group with the file's
 * import block rather than landing above a leading header docstring. Files
 * with no import statement (rare for a model) get the lines prepended.
 */
function insertHoistedImports(text: string, importLines: readonly string[]): string {
  const block = importLines.join("\n") + "\n";
  const match = /^import\s/m.exec(text);
  if (!match) return block + text;
  return text.slice(0, match.index) + block + text.slice(match.index);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  // With no args, process the canonical pilot set under MODELS_DIR. With args,
  // accept either a bare model filename (resolved against MODELS_DIR, the
  // historical behavior) or a path that resolves to an existing file relative
  // to the cwd / absolute — so the generator can materialize declares into test
  // files outside the canonical models dir.
  const targets =
    args.length > 0
      ? args.map((a) => {
          const direct = path.resolve(a);
          if (fs.existsSync(direct)) return direct;
          return path.join(MODELS_DIR, path.basename(a));
        })
      : PILOT.map((f) => path.join(MODELS_DIR, f));
  const registry = buildModelRegistry();

  const modelsDirPrefix = MODELS_DIR + path.sep;
  // The canonical schema map is only consumed when materializing files UNDER
  // MODELS_DIR (test-local models elsewhere supply their own bespoke schema).
  // Load it lazily via dynamic import so a test-file-only run never pays the
  // import cost of `define-schema`'s adapter-runtime dependency graph. This is
  // now purely an import-cost optimization: the static-import TDZ crash it
  // originally worked around is fixed at the source (abstract-adapter defers its
  // mixin wiring to first construction), so `isWrappedSchema` imports cleanly.
  let schemaColumnsByTable: SchemaColumnsByTable = {};
  if (targets.some((f) => f.startsWith(modelsDirPrefix))) {
    const { TEST_SCHEMA } = await import("../src/test-helpers/test-schema.js");
    const { isWrappedSchema } = await import("../src/test-helpers/define-schema.js");
    schemaColumnsByTable = normalizeSchema(TEST_SCHEMA, isWrappedSchema);
  }
  const associationLookup = buildModelAssociationLookup(registry);
  const globalSuperNameOf = buildGlobalSuperNameOf(registry);
  const namespacedClassRegistry = buildNamespacedClassRegistry(registry);
  for (const file of targets) {
    const source = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
    // `virtualize` re-parses `source` into its own AST, so a predicate
    // keyed on node identity would never match there. Key on the node's
    // source span instead — identical text re-parses to identical
    // `pos`/`end`, so the predicate is stable across both parses.
    const modelSpans = new Set<string>();
    for (const cls of collectModelClassNodes(sf)) modelSpans.add(`${cls.pos}:${cls.end}`);
    const isModelClass = (cls: ts.ClassDeclaration): boolean =>
      modelSpans.has(`${cls.pos}:${cls.end}`);
    const baseAliases = buildClassNameAliases(sf);
    // Gap A + Gap B: extend aliases with namespaced class resolutions and
    // registry-corrected classify results.
    const classNameAliases = buildExtendedAliases(
      sf,
      baseAliases,
      isModelClass,
      registry,
      namespacedClassRegistry,
    );
    // Gap D: collect composedOf mapping columns to exclude from schema declares.
    const composedOfColumns = extractComposedOfColumns(sf);
    // Pre-resolve `through:` targets so declares + auto-imports name the real
    // source class, not `classify`-of-the-association-name.
    const associationTargets = buildAssociationTargets(
      walk(sf, { isModelClass }),
      associationLookup,
      classNameAliases,
    );
    const prependImports = resolveAutoImports(
      sf,
      file,
      registry,
      isModelClass,
      classNameAliases,
      associationTargets,
    );
    // The schema-column merge maps each model to a table by `tableName` (or
    // `pluralize(underscore(className))` when unset) and bakes that table's
    // canonical columns into the declares. That is correct for the canonical
    // models under MODELS_DIR, but test-local model classes elsewhere define
    // their own bespoke schemas — a class named `Post` (or one assigning
    // `this.tableName` in a static block, which the walker does not capture)
    // would otherwise pull phantom columns off the canonical `posts` table
    // that its runtime table lacks. For files outside MODELS_DIR we therefore
    // omit the schema map: declares then reflect only the class's explicit
    // `attribute()` / association / enum calls — exactly its real surface.
    const underModelsDir = file.startsWith(modelsDirPrefix);
    const { text: virtualized } = virtualize(source, file, {
      isModelClass,
      prependImports,
      schemaColumnsByTable: underModelsDir ? schemaColumnsByTable : undefined,
      classNameAliases,
      associationTargets,
      composedOfColumns: composedOfColumns.size > 0 ? composedOfColumns : undefined,
      // Baked attribute declares allow null assignment (Rails attributes
      // carry no NOT NULL constraint); the live tsc-plugin keeps bare `T`.
      attributesNullable: true,
      globalSuperNameOf,
    });
    if (virtualized === source) {
      process.stdout.write(`  unchanged ${path.basename(file)}\n`);
      continue;
    }
    // Rewrite the virtualizer's inline `import("…").X` type expressions
    // into bare references + hoisted top-level `import type` lines.
    const { text: hoisted, importLines } = hoistInlineImports(
      virtualized,
      collectNamesInScope(sf),
      path.dirname(file),
    );
    const text = importLines.length > 0 ? insertHoistedImports(hoisted, importLines) : hoisted;
    fs.writeFileSync(file, text);
    const added = text.split("\n").length - source.split("\n").length;
    process.stdout.write(`  materialized ${path.basename(file)} (+${added} lines)\n`);
  }
}

await main();
