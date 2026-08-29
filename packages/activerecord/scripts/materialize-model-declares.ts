import ts from "typescript";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { classify, camelize } from "@blazetrails/activesupport";
import { virtualize } from "../src/type-virtualization/virtualize.js";
import { walk, type ClassInfo, type AssociationCall } from "../src/type-virtualization/walker.js";
import {
  resolveAssociationTarget,
  resolveThroughTarget,
  isEmittableTargetName,
  stripQuotes,
  type ModelAssociationLookup,
} from "../src/type-virtualization/resolve-target.js";
import type { SchemaColumnValue } from "../src/type-virtualization/synthesize.js";
import type { TableSchema, WrappedTableSchema } from "../src/support/schema-types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = path.resolve(__dirname, "../src/test-helpers/models");

const PILOT = ["topic.ts", "developer.ts"];

type SchemaColumnsByTable = Record<string, Record<string, SchemaColumnValue>>;

function normalizeSchema(
  schema: Record<string, TableSchema>,
  isWrappedSchema: (table: TableSchema) => table is WrappedTableSchema,
): SchemaColumnsByTable {
  const out: SchemaColumnsByTable = {};
  for (const [table, value] of Object.entries(schema)) {
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
        const stripped = stripQuotes(rawClassName);
        if (stripped.includes("::") && !out.has(stripped)) {
          const tsName = resolveNamespacedClassName(stripped, namespacedRegistry);
          if (tsName) out.set(stripped, tsName);
        }
      } else {
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

function superClassNameOf(cls: ts.ClassDeclaration): string | undefined {
  for (const hc of cls.heritageClauses ?? []) {
    if (hc.token !== ts.SyntaxKind.ExtendsKeyword) continue;
    const expr = hc.types[0]?.expression;
    if (expr && ts.isIdentifier(expr)) return expr.text;
  }
  return undefined;
}

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
    if (seen.has(className)) return null;
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

function buildAssociationTargets(
  sf: ts.SourceFile,
  modelClasses: readonly ClassInfo[],
  lookup: ModelAssociationLookup,
  aliases: ReadonlyMap<string, string>,
  registry: ReadonlyMap<string, string>,
): Map<string, string> {
  const targets = new Map<string, string>();
  const moduleScope = collectNamesInScope(sf);
  for (const info of modelClasses) {
    const own = associationCalls(info);
    const visible = new Set(moduleScope);
    collectVisibleClassNames(info.classDecl, visible);
    const defining = lookup(info.name) ?? own;
    for (const call of own) {
      if (call.options["through"]) {
        const resolved = resolveThroughTarget(defining, call, lookup, aliases) ?? "Base";
        targets.set(`${info.name}#${call.name}`, resolved);
        continue;
      }
      if (call.options["polymorphic"] === "true") continue;
      const resolved = resolveAssociationTarget(call);
      const mapped = aliases.get(resolved) ?? resolved;
      if (
        isEmittableTargetName(
          mapped,
          (n) => registry.has(n),
          (n) => visible.has(n),
        )
      )
        continue;
      targets.set(`${info.name}#${call.name}`, "Base");
    }
  }
  return targets;
}

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
    memo.set(cls, false);
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
    const override = associationTargets.get(`${info.name}#${call.name}`);
    if (override) {
      out.add(override);
      continue;
    }
    const target = resolveAssociationTarget(call);
    out.add(aliases.get(target) ?? target);
  }
}

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

export const INLINE_IMPORT_RE = /import\("([^"]+)"\)\.([A-Za-z_$][\w$]*)(?![\w$]|\s*\()/g;
const BUILTIN_IMPORT_FROM_MODELS_DIR: Record<string, string> = {
  AssociationProxy: "../../associations/collection-proxy.js",
  Relation: "../../relation.js",
  IPAddr: "../../connection-adapters/postgresql/oid/cidr.js",
  PrimaryKeyValue: "../../base.js",
};

function builtinSpecifierFor(sym: string, fileDir: string): string | undefined {
  const fromModels = BUILTIN_IMPORT_FROM_MODELS_DIR[sym];
  if (!fromModels) return undefined;
  const abs = path.resolve(MODELS_DIR, fromModels);
  let rel = path.relative(fileDir, abs).replace(/\\/g, "/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

export function hoistInlineImports(
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

function insertHoistedImports(text: string, importLines: readonly string[]): string {
  const block = importLines.join("\n") + "\n";
  const match = /^import\s/m.exec(text);
  if (!match) return block + text;
  return text.slice(0, match.index) + block + text.slice(match.index);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
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
  let schemaColumnsByTable: SchemaColumnsByTable = {};
  if (targets.some((f) => f.startsWith(modelsDirPrefix))) {
    const { TEST_SCHEMA, ARUNIT2_SCHEMA } = await import("../src/test-helpers/test-schema.js");
    const { isWrappedSchema } = await import("../src/support/schema-types.js");
    schemaColumnsByTable = normalizeSchema({ ...TEST_SCHEMA, ...ARUNIT2_SCHEMA }, isWrappedSchema);
  }
  const associationLookup = buildModelAssociationLookup(registry);
  const globalSuperNameOf = buildGlobalSuperNameOf(registry);
  const namespacedClassRegistry = buildNamespacedClassRegistry(registry);
  for (const file of targets) {
    const source = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true);
    const modelSpans = new Set<string>();
    for (const cls of collectModelClassNodes(sf)) modelSpans.add(`${cls.pos}:${cls.end}`);
    const isModelClass = (cls: ts.ClassDeclaration): boolean =>
      modelSpans.has(`${cls.pos}:${cls.end}`);
    const baseAliases = buildClassNameAliases(sf);
    const classNameAliases = buildExtendedAliases(
      sf,
      baseAliases,
      isModelClass,
      registry,
      namespacedClassRegistry,
    );
    const composedOfColumns = extractComposedOfColumns(sf);
    const associationTargets = buildAssociationTargets(
      sf,
      walk(sf, { isModelClass }),
      associationLookup,
      classNameAliases,
      registry,
    );
    const prependImports = resolveAutoImports(
      sf,
      file,
      registry,
      isModelClass,
      classNameAliases,
      associationTargets,
    );
    const underModelsDir = file.startsWith(modelsDirPrefix);
    const moduleScope = collectNamesInScope(sf);
    const isKnownTarget = (name: string, host: ClassInfo): boolean => {
      if (name === "Base" || registry.has(name) || moduleScope.has(name)) return true;
      const visible = new Set<string>();
      collectVisibleClassNames(host.classDecl, visible);
      return visible.has(name);
    };
    const { text: virtualized } = virtualize(source, file, {
      isModelClass,
      prependImports,
      schemaColumnsByTable: underModelsDir ? schemaColumnsByTable : undefined,
      classNameAliases,
      associationTargets,
      composedOfColumns: composedOfColumns.size > 0 ? composedOfColumns : undefined,
      isKnownTarget,
      attributesNullable: true,
      globalSuperNameOf,
    });
    if (virtualized === source) {
      process.stdout.write(`  unchanged ${path.basename(file)}\n`);
      continue;
    }
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

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await main();
}
