#!/usr/bin/env npx tsx
/**
 * Method-centric API comparison.
 *
 * Compares Ruby Rails API surface with our TypeScript API by matching
 * individual methods, not class/module wrappers. The file IS the module —
 * if Ruby's `Sanitization` module defines `sanitize_sql`, we look for
 * `sanitizeSql` anywhere in the expected TS file, regardless of whether
 * there's a `Sanitization` class/interface wrapping it.
 *
 * This prevents agents from gaming the metric with empty interfaces.
 *
 * Usage:
 *   npx tsx scripts/api-compare/compare.ts \
 *     [--package activerecord] [--missing] [--files] [--incomplete] \
 *     [--inheritance] [--public-only | --privates-only]
 *
 * The default reports the full surface (public + private). `--public-only`
 * drops Rails-private/internal methods on both sides for a contract-only
 * view; `--privates-only` is the inverse. The JSON artifact is always
 * written to output/api-comparison*.json regardless of flags.
 *
 * Each host class's expected method set is expanded with the instance
 * methods of every module it `include`s (and class methods of modules it
 * `extend`s), recursively. This catches mixin wiring gaps where the
 * mixin's methods live in a sibling TS file but aren't actually reachable
 * on the host — e.g. arel #814: `Predications` methods existed in
 * `predications.ts` but `NodeExpression` didn't mix them in, so
 * `(node).eq(...)` failed at runtime despite a "100%" compare result.
 */

import * as fs from "fs";
import * as path from "path";
import type { ApiManifest, ClassInfo, MethodInfo, PackageInfo } from "./types.js";
import {
  DIR_TO_PACKAGES,
  OUTPUT_DIR,
  PACKAGE_DIR_OVERRIDES,
  PACKAGES,
  ROOT_DIR,
  packageSrcDir,
} from "./config.js";
import { SpellChecker } from "../../packages/did-you-mean/src/spell-checker.js";
import { rubyFileToTs, rubyMethodToTs } from "./conventions.js";
import { isSourceUnported } from "./unported-files.js";

const DETAIL_PACKAGES = new Set([
  "arel",
  "activemodel",
  "activerecord",
  "activesupport",
  "actiondispatch",
  "actioncontroller",
  "abstractcontroller",
  "actionpackversion",
  "actionview",
]);

// Files intentionally excluded from comparison live in unported-files.ts.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MethodResult {
  rubyName: string;
  tsName: string;
  rubyModule: string;
}

interface MoveResult {
  tsName: string;
  rubyName: string;
  rubyModule: string;
  expectedFile: string;
  actualFile: string;
}

interface FileResult {
  rubyFile: string;
  expectedTsFile: string;
  tsFileExists: boolean;
  /**
   * If set, the expected TS file does not exist but methods cluster at
   * this sibling path (cross-file misplacement detection). Reported with
   * a `↦` marker and counted in the package's `misplacedFiles` tally.
   */
  misplacedAt?: string;
  matched: number;
  missing: number;
  total: number;
  missingMethods: MethodResult[];
  moves: MoveResult[];
}

interface PackageResult {
  package: string;
  totalMethods: number;
  matched: number;
  missing: number;
  percent: number;
  totalFiles: number;
  filesExist: number;
  misplacedFiles: number;
  excludedFiles: string[];
  files: FileResult[];
  inheritance: InheritanceResult;
}

interface InheritanceMismatch {
  rubyFqn: string;
  rubyFile: string;
  tsFile: string;
  tsName: string;
  rubySuper: string | null;
  tsSuper: string | null;
  tsChain: string[];
  reason: "super-mismatch" | "ts-class-missing";
}

interface InheritanceResult {
  checked: number;
  matched: number;
  mismatches: InheritanceMismatch[];
}

// Ruby builtin types whose TS equivalent cannot meaningfully extend them
// (e.g. `class X < String`, `class X < Struct.new(...)`, `class X < Module`
// for Ruby metaprogramming primitives). Treat the TS side's choice of
// base class as always matching when Ruby uses one of these.
const RUBY_UNEXTENDABLE_BUILTINS = new Set([
  "String",
  "Struct",
  "Array",
  "Hash",
  "Numeric",
  "Integer",
  "Float",
  "Set",
  "Delegator",
  "SimpleDelegator",
  "Module",
]);

// Ruby builtin exception classes → TS `Error` is the accepted equivalent.
const RUBY_ERROR_BUILTINS = new Set([
  "StandardError",
  "RuntimeError",
  "Exception",
  "ArgumentError",
  "TypeError",
  "NotImplementedError",
  "NameError",
  "NoMethodError",
  "IndexError",
  "KeyError",
  "RangeError",
  "IOError",
]);

function shortName(fqn: string | undefined | null): string | null {
  if (!fqn) return null;
  // Ruby uses `::` as the namespace separator; TS extractor stores the
  // raw superclass expression, so `extends globalThis.Error` ends up as
  // `globalThis.Error` — strip either separator to reach the leaf name.
  const parts = fqn.split(/::|\./);
  return parts[parts.length - 1] || null;
}

// Trails rename prefixes/suffixes used to disambiguate when a Rails class
// name would collide with a built-in, a TS keyword, or another identifier
// already in scope. Each entry lets `<ruby>` match `<prefix><ruby>` /
// `<ruby><suffix>` on the TS side so the inheritance check sees through the
// alias.
// - `Abstract<X>`: parent import-aliased so an adapter can shadow its name
//   (e.g. PG's `TableDefinition extends TableDefinition`).
// - `Base<X>`: TS-added intermediate base class (`BaseLogSubscriber`,
//   `BaseAbsenceValidator`) — Rails has a single class Trails splits in two.
// - `ActiveModel<X>`: ActiveRecord's `Type::Date` collides with the JS
//   `Date` constructor, so we import the ActiveModel type aliased.
// - `<X>Type` suffix: Trails suffixes attribute-type classes to avoid
//   clashing with the value they represent (e.g. `Json` value vs
//   `JsonType` the cast type).
const TS_PARENT_ALIASES: { transform: (ruby: string) => string }[] = [
  { transform: (r) => `Abstract${r}` },
  { transform: (r) => `Base${r}` },
  { transform: (r) => `ActiveModel${r}` },
  { transform: (r) => `${r}Type` },
  // `Numeric<X>Type`: ActiveModel's `Helpers::Numeric` is mixed into
  // Integer/Float/Decimal via the `applyNumericMixin(ValueType)` HOC. The
  // returned class is bound to a local const `NumericValueType` that the
  // extractor sees as the immediate TS superclass; conceptually it is
  // `ValueType` with the Numeric helper applied.
  { transform: (r) => `Numeric${r}Type` },
];

export function nameMatches(rubyName: string, tsName: string): boolean {
  if (rubyName === tsName) return true;
  if (RUBY_ERROR_BUILTINS.has(rubyName) && tsName === "Error") return true;
  for (const { transform } of TS_PARENT_ALIASES) {
    if (tsName === transform(rubyName)) return true;
  }
  return false;
}

/**
 * Ruby inheritance is preserved on the TS side if Ruby's immediate
 * superclass appears *anywhere* in TS's ancestor chain. This accepts
 * Trails' common pattern of inserting an abstract intermediate class
 * (e.g. `TableDefinition extends AbstractTableDefinition extends TableDefinition`).
 */
// Rails classes where the TS port adds an abstract intermediate above
// what Rails treats as the root. Accept null-ruby-super + TS extending
// that intermediate as a matched deviation rather than a fidelity gap.
//
// Keyed by ts class name → ts superclass name that should be accepted.
// - Arel Table/Attribute: Rails has no super (plain object or
//   `Struct.new(...)`), TS roots them at `Node` for uniform AST walking.
// - ActiveModel ValueType: Rails' `Value` has no super, TS adds an
//   abstract `Type` above so subclasses can declare `abstract cast`.
// - AR LockingType / Serialized: Rails uses `DelegateClass(Type::Value)`
//   — a dynamic parent our extractor can't resolve (comes through as
//   null). TS extends `ValueType` directly, which matches the intent.
const TS_ROOT_INTERMEDIATE = new Map<string, string>([
  ["Table", "Node"],
  ["Attribute", "Node"],
  ["ValueType", "Type"],
  ["LockingType", "ValueType"],
  ["Serialized", "ValueType"],
  ["TimeZoneConverter", "ValueType"],
  // `ActiveRecord::Base` has no Ruby super; TS `Base` extends `Model`
  // so the ActiveModel mixin surface is type-visible on subclasses.
  ["Base", "Model"],
]);

// Per-class TS renames that don't fit the systematic alias patterns
// (Abstract<X>, Base<X>, ActiveModel<X>, <X>Type). Keyed by the Ruby
// short name → the literal TS class name in the expected file.
// - `Name` → `ModelName`: Rails `ActiveModel::Name`. `Name` alone is
//   too generic in TS, so the flattened class keeps the `Model` prefix.
// - `Railtie` → `Trailtie`: Trails railties are not Rails::Railtie subclasses;
//   the pun name signals that distinction across all packages.
// - `Registry` → `TypeRegistry`: same rationale for `ActiveModel::Type::Registry`.
const TS_CLASS_RENAMES: Record<string, string> = {
  Name: "ModelName",
  Railtie: "Trailtie",
  Registry: "TypeRegistry",
};

/**
 * Resolve the TS class that corresponds to a Ruby class. Tries, in order:
 *
 *   1. The direct short-name match in the expected file.
 *   2. The Trails rename aliases (`Abstract<X>`, `Base<X>`,
 *      `ActiveModel<X>`, `<X>Type`) in the same file.
 *   3. Explicit per-class renames (TS_CLASS_RENAMES).
 *
 * When both (1) and (2) hit, prefer whichever declares a superclass —
 * TS files sometimes keep a query-value helper under the plain Ruby
 * name while the real Rails-shape class lives under the alias
 * (`oid/range.ts`: the bounds helper `Range` + the OID cast type
 * `RangeType extends ValueType<Range>`).
 */
export function resolveTsClassForRuby(
  short: string,
  expectedFile: string,
  tsByFileName: Map<string, ClassInfo>,
): ClassInfo | undefined {
  const direct = tsByFileName.get(`${expectedFile}::${short}`);
  const aliasMatches = TS_PARENT_ALIASES.map(({ transform }) =>
    tsByFileName.get(`${expectedFile}::${transform(short)}`),
  ).filter((c): c is ClassInfo => Boolean(c));

  let resolved = direct;
  if (!resolved) {
    resolved = aliasMatches[0];
  } else if (!resolved.superclass) {
    const withSuper = aliasMatches.find((c) => Boolean(c.superclass));
    if (withSuper) resolved = withSuper;
  }
  if (!resolved) {
    const rename = TS_CLASS_RENAMES[short];
    if (rename) resolved = tsByFileName.get(`${expectedFile}::${rename}`);
  }
  return resolved;
}

export function superclassesMatch(
  rubySuper: string | null,
  tsChain: string[],
  tsName: string,
): boolean {
  if (!rubySuper && tsChain.length === 0) return true;
  // Ruby builtins have no faithful TS superclass; accept whatever TS uses.
  if (rubySuper && RUBY_UNEXTENDABLE_BUILTINS.has(rubySuper)) return true;
  // Rails-idiomatic "plain object" classes extend Arel.Node in TS.
  const expectedIntermediate = TS_ROOT_INTERMEDIATE.get(tsName);
  if (!rubySuper && expectedIntermediate && tsChain.includes(expectedIntermediate)) return true;
  if (!rubySuper || tsChain.length === 0) return false;
  return tsChain.some((ancestor) => nameMatches(rubySuper, ancestor));
}

/**
 * Comparison bucket a method participates in.
 *   - "all":     default — public + private combined (full surface).
 *                Reported by `pnpm api:compare` with no flags.
 *   - "public":  `--public-only` — drops `internal: true` on both sides
 *                for a contract-only view (matches the historical
 *                default's numbers).
 *   - "private": `--privates-only` — Ruby `private`/`protected` and TS
 *                `private`/`protected`/`#`-prefixed methods only.
 * Exported so compare.test.ts can pin the filter semantics.
 */
export type CompareMode = "public" | "all" | "private";

export function methodInMode(m: MethodInfo, mode: CompareMode): boolean {
  if (mode === "all") return true;
  if (mode === "private") return m.internal === true;
  return m.internal !== true;
}

/**
 * Whether a TS method should be included in the per-file lookup index for a
 * given mode. This is the TS-side counterpart to methodInMode (which filters
 * the Ruby side).
 *
 *   public: only public TS methods — internal helpers must not satisfy Ruby
 *           public method coverage (would inflate scores).
 *   private: ALL TS methods — Rails private methods implemented as exported
 *            TS functions (e.g. exported for wiring) still count as matched.
 *   all:    ALL TS methods — full combined surface, same widening as private.
 */
export function tsShouldIncludeInIndex(m: MethodInfo, mode: CompareMode): boolean {
  return mode === "public" ? !m.internal : true;
}

/**
 * Resolve a bare include name (e.g. `"Quoting"`) to the best-matching FQN(s)
 * from the perspective of `contextFqn` (the including class or module).
 *
 * Ruby's constant lookup walks enclosing namespaces outward. Given
 * `ActiveRecord::ConnectionAdapters::AbstractAdapter` including `"Quoting"`,
 * Ruby resolves to `ActiveRecord::ConnectionAdapters::Quoting` — NOT to
 * `ActiveRecord::ConnectionAdapters::PostgreSQL::Quoting` even though both
 * have the same short name. This scoped resolution avoids the false-positive
 * where PostgreSQL-specific methods inflate AbstractAdapter's missing count.
 *
 * If the name already contains `::` it is returned as-is. If only one FQN
 * matches the short name, that single candidate is returned regardless of
 * context. When multiple candidates exist, namespace-prefix walking picks the
 * nearest enclosing match; if none of the candidates share a namespace prefix
 * with the context the full candidate list is returned (original behavior,
 * safe fallback).
 */
export function resolveModuleName(
  incName: string,
  contextFqn: string,
  moduleFqnByShort: Map<string, string[]>,
): string[] {
  if (incName.includes("::")) return [incName];
  const candidates = moduleFqnByShort.get(incName);
  if (!candidates || candidates.length === 0) return [incName];
  if (candidates.length === 1) return candidates;

  // Walk namespace prefixes from longest to shortest, pick first match.
  const parts = contextFqn.split("::");
  for (let i = parts.length; i > 0; i--) {
    const candidate = `${parts.slice(0, i).join("::")}::${incName}`;
    if (candidates.includes(candidate)) return [candidate];
  }

  // No prefix match — fall back to all candidates (original behavior).
  return candidates;
}

/**
 * Flatten `include`/`extend`-reachable methods onto a host entity.
 *
 * Ruby's `include Mod` flattens Mod's instance methods onto the including
 * class's lookup chain; `extend Mod` flattens them as singleton (class)
 * methods. The api-compare manifest records each entity's *own* declared
 * methods only, so without this expansion `Base.includes = ["Querying"]`
 * doesn't surface `Querying`'s methods as part of `Base`'s expected TS
 * surface — and a Rails class can pass api-compare with the mixin's
 * methods living in some other TS file but never reachable on the host.
 *
 * Only the host's *own* `extend` lands as class methods. Ruby `extend`
 * affects only the receiver's singleton class and does not propagate
 * through `include` chains, so a module's `extend X` (e.g. `module M;
 * extend ActiveSupport::Concern; end`) does NOT give `X`'s methods to
 * a class that does `include M`. (Rails' "class methods via include"
 * pattern is ASC's nested `ClassMethods` submodule, which compare.ts
 * folds into the parent module before this helper runs.) Nested
 * `include` chains do propagate, so a module that includes another
 * module contributes those chained methods to the host as instance
 * methods (or class methods if the host got them via `extend`).
 *
 * Cycles are guarded by `visited`. Modules outside the package are
 * silently skipped — stdlib like `Comparable`/`Enumerable` falls through.
 *
 * `entityFqn` drives namespace-scoped include resolution (see
 * `resolveModuleName`): `AbstractAdapter` including `"Quoting"` resolves
 * only to `ConnectionAdapters::Quoting`, not to adapter-specific siblings.
 */
export function flattenIncludedMethodInfos(
  entity: ClassInfo,
  entityFqn: string,
  rubyPkg: PackageInfo,
  moduleFqnByShort: Map<string, string[]>,
): { instance: MethodInfo[]; klass: MethodInfo[] } {
  const instance: MethodInfo[] = [...entity.instanceMethods];
  const klass: MethodInfo[] = [...entity.classMethods];
  const visited = new Set<string>();

  const walk = (incName: string, asClassMethods: boolean, contextFqn: string): void => {
    const fqns = resolveModuleName(incName, contextFqn, moduleFqnByShort);
    for (const fqn of fqns) {
      if (visited.has(fqn)) continue;
      visited.add(fqn);
      const mod = rubyPkg.modules[fqn] as unknown as ClassInfo | undefined;
      if (!mod) continue;
      const sink = asClassMethods ? klass : instance;
      for (const m of mod.instanceMethods) sink.push(m);
      for (const inc of mod.includes ?? []) walk(inc, asClassMethods, fqn);
    }
  };

  for (const inc of entity.includes ?? []) walk(inc, false, entityFqn);
  for (const ext of entity.extends ?? []) walk(ext, true, entityFqn);
  return { instance, klass };
}

/**
 * Dedup expected Ruby methods by Ruby method name (NOT first TS
 * candidate). Two distinct Ruby methods can produce the same first TS
 * candidate (`is_number?` and `number?` both → `"isNumber"`); keying
 * by the TS candidate would silently drop the second method from the
 * expected set. Caller supplies a per-file `seen` map (keyed by method
 * name); this helper just records the first sighting and ignores
 * subsequent ones, matching the original per-file dedup behavior with
 * a different key. Skips methods with no TS-candidate mapping
 * (operators, SKIP list).
 */
export function dedupeRubyMethodInto(
  seen: Map<string, { rubyName: string; rubyModule: string }>,
  rm: MethodInfo,
  itemFqn: string,
): void {
  if (rubyMethodToTs(rm.name) === null) return;
  const key = rm.name;
  if (!seen.has(key)) {
    seen.set(key, { rubyName: rm.name, rubyModule: itemFqn });
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Pick the best candidate sibling TS file for a Ruby file whose
 * expected TS path doesn't exist. Returns the path, or null if no
 * cluster meets all three thresholds:
 *
 * 1. Absolute floor (`MISPLACED_MIN_HITS`, currently 3) — at least
 *    this many of the Ruby file's candidate method names appear.
 *    Filters out 1- or 2-method noise hits.
 * 2. Coverage floor (`bestCount * 2 >= rubyMethodCount`) — the
 *    cluster covers at least 50% of the Ruby file's expected methods.
 * 3. Separation (`bestCount >= secondCount * 2`) — the leader has at
 *    least 2× the runner-up's hits. Without this, a Ruby file whose
 *    methods are evenly scattered across many TS files (generic names
 *    like `name`/`value`/`run`) would arbitrarily latch onto whichever
 *    file iterated first.
 *
 * All three together rule out the `deprecator.rb ↦ migration.ts`
 * pattern observed during development: 3 hits but only 43% coverage
 * and no separation from the noise floor.
 */
export const MISPLACED_MIN_HITS = 3;
export function selectMisplacedFile(
  fileHits: Map<string, number>,
  rubyMethodCount: number,
): string | null {
  let bestFile: string | null = null;
  let bestCount = 0;
  let secondCount = 0;
  for (const [f, c] of fileHits) {
    if (c > bestCount) {
      secondCount = bestCount;
      bestFile = f;
      bestCount = c;
    } else if (c > secondCount) {
      secondCount = c;
    }
  }
  if (!bestFile) return null;
  if (bestCount < MISPLACED_MIN_HITS) return null;
  if (bestCount * 2 < rubyMethodCount) return null;
  if (bestCount < secondCount * 2) return null;
  return bestFile;
}

/**
 * Build a name → ClassInfo[] map for `pkg`, unioning in entities from every
 * @blazetrails/* dependency so the inheritance walker can cross package
 * boundaries (e.g. AR Base extends AM Model).
 */
export function buildEntitiesByName(pkg: string, ts: ApiManifest): Map<string, ClassInfo[]> {
  const map = new Map<string, ClassInfo[]>();

  const isFixture = (e: ClassInfo) =>
    (e.file ?? "").includes("__fixtures__") || (e.file ?? "").startsWith("tsc-wrapper/");

  const addPkg = (pkgKey: string) => {
    const p = ts.packages[pkgKey];
    if (!p) return;
    for (const entity of [...Object.values(p.classes), ...Object.values(p.modules)]) {
      if (isFixture(entity)) continue;
      const list = map.get(entity.name) ?? [];
      list.push(entity);
      map.set(entity.name, list);
    }
  };

  // Always include the current package first so same-package candidates beat
  // cross-package ones in the proximity tie-breaker.
  addPkg(pkg);

  // Read @blazetrails/* deps from package.json to discover sibling packages.
  const dirName = PACKAGE_DIR_OVERRIDES[pkg] ?? pkg;
  const pkgJsonPath = path.join(ROOT_DIR, "packages", dirName, "package.json");
  if (fs.existsSync(pkgJsonPath)) {
    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf-8")) as Record<
        string,
        Record<string, string>
      >;
      const allDeps = {
        ...((pkgJson["dependencies"] as Record<string, string>) ?? {}),
        ...((pkgJson["peerDependencies"] as Record<string, string>) ?? {}),
      };
      for (const dep of Object.keys(allDeps)) {
        if (!dep.startsWith("@blazetrails/")) continue;
        const depDir = dep.replace("@blazetrails/", "");
        // A single npm package may map to multiple api-compare keys
        // (e.g. actionpack → actiondispatch + actioncontroller).
        const depKeys = DIR_TO_PACKAGES[depDir] ?? [depDir];
        for (const depKey of depKeys) {
          if (depKey !== pkg) addPkg(depKey);
        }
      }
    } catch {
      // Non-fatal: if we can't read deps, fall back to same-package only.
    }
  }

  return map;
}

function main() {
  const args = process.argv.slice(2);
  const pkgIndex = args.indexOf("--package");
  let filterPkg: string | null = null;
  if (pkgIndex !== -1) {
    const value = args[pkgIndex + 1];
    if (!value || value.startsWith("--")) {
      console.error("--package requires a package name (e.g. --package activerecord)");
      process.exit(1);
    }
    if (!PACKAGES.includes(value)) {
      const suggestions = new SpellChecker({ dictionary: PACKAGES }).correct(value);
      const hint = suggestions.length ? ` Did you mean: ${suggestions.join(", ")}?` : "";
      console.error(`--package: unknown package "${value}".${hint}`);
      console.error(`Available: ${PACKAGES.join(", ")}`);
      process.exit(1);
    }
    filterPkg = value;
  }
  const showMissing = args.includes("--missing");
  const showFiles = args.includes("--files");
  const showIncomplete = args.includes("--incomplete");
  const showInheritance = args.includes("--inheritance");
  // Comparison bucket:
  //   default        → public + private combined (full surface)
  //   --public-only  → public API only (historical default; matches
  //                    older coverage numbers and external API contracts)
  //   --privates-only→ private/protected only (Ruby `private`/`protected`,
  //                    TS `private`/`protected`, `#`-prefixed fields)
  //   --privates     → no-op alias for the new default; pre-flip CI
  //                    invocations and docs continue to work without
  //                    edits. Combining --privates with --public-only or
  //                    --privates-only is rejected as ambiguous.
  const privatesOnly = args.includes("--privates-only");
  const publicOnly = args.includes("--public-only");
  const privatesAlias = args.includes("--privates");
  if (privatesOnly && publicOnly) {
    console.error("Error: --public-only and --privates-only are mutually exclusive — pick one.");
    process.exit(1);
  }
  if (privatesAlias && (privatesOnly || publicOnly)) {
    console.error(
      "Error: --privates (alias for the default full-surface mode) cannot be combined with --public-only or --privates-only.",
    );
    process.exit(1);
  }
  const mode: CompareMode = privatesOnly ? "private" : publicOnly ? "public" : "all";
  const methodMatchesMode = (m: MethodInfo): boolean => methodInMode(m, mode);

  const rubyPath = path.join(OUTPUT_DIR, "rails-api.json");
  const tsPath = path.join(OUTPUT_DIR, "ts-api.json");

  if (!fs.existsSync(rubyPath)) {
    console.error("Missing rails-api.json — run extract-ruby-api.rb first");
    process.exit(1);
  }
  if (!fs.existsSync(tsPath)) {
    console.error("Missing ts-api.json — run extract-ts-api.ts first");
    process.exit(1);
  }

  const ruby: ApiManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));
  const ts: ApiManifest = JSON.parse(fs.readFileSync(tsPath, "utf-8"));

  const results: PackageResult[] = [];

  for (const [pkg, rubyPkg] of Object.entries(ruby.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;

    const tsPkg = ts.packages[pkg];

    // Build per-file method index from TS: file → Set<methodName>.
    // See tsShouldIncludeInIndex for the inclusion semantics.
    const tsShouldInclude = (m: MethodInfo) => tsShouldIncludeInIndex(m, mode);
    const tsMethodsByFile = new Map<string, Set<string>>();

    if (tsPkg) {
      const addMethods = (cls: ClassInfo) => {
        const file = cls.file || "";
        const methods = tsMethodsByFile.get(file) || new Set();
        for (const m of [...cls.instanceMethods, ...cls.classMethods]) {
          if (tsShouldInclude(m)) methods.add(m.name);
        }
        tsMethodsByFile.set(file, methods);
      };

      for (const cls of Object.values(tsPkg.classes)) addMethods(cls);
      for (const mod of Object.values(tsPkg.modules)) addMethods(mod);

      // Include file-level functions (top-level exports not in any class/interface)
      if (tsPkg.fileFunctions) {
        for (const [file, fns] of Object.entries(tsPkg.fileFunctions)) {
          const methods = tsMethodsByFile.get(file) || new Set();
          for (const fn of fns) {
            if (tsShouldInclude(fn)) methods.add(fn.name);
          }
          tsMethodsByFile.set(file, methods);
        }
      }
    }

    // Propagate inherited methods transitively: follows both class `superclass`
    // and interface/module `extends` chains.
    if (tsPkg) {
      // Key by short name → entity for superclass/extends resolution.
      // Includes dep-package entities so walks can cross package boundaries
      // (e.g. AR Base extends AM Model).
      const entitiesByName = buildEntitiesByName(pkg, ts);

      const entityKey = (e: ClassInfo) => `${e.file}:${e.name}`;

      // When multiple entities share a name, pick the best parent by
      // file path proximity (most shared directory segments).
      const resolveParent = (name: string, childFile: string): ClassInfo | null => {
        const candidates = entitiesByName.get(name) || [];
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        const childParts = (childFile || "").split("/");
        let best: ClassInfo | null = null;
        let bestScore = -1;
        for (const c of candidates) {
          if (c.file === childFile) continue; // skip self
          const parts = (c.file || "").split("/");
          let shared = 0;
          for (let i = 0; i < Math.min(childParts.length, parts.length); i++) {
            if (childParts[i] === parts[i]) shared++;
            else break;
          }
          if (shared > bestScore) {
            bestScore = shared;
            best = c;
          }
        }
        return best ?? candidates[0];
      };

      const inheritedCache = new Map<string, Set<string>>();
      const getInherited = (entity: ClassInfo, visited: Set<string>): Set<string> => {
        const key = entityKey(entity);
        const cached = inheritedCache.get(key);
        if (cached) return cached;
        if (visited.has(key)) return new Set();
        visited.add(key);

        const methods = new Set<string>();
        for (const m of [...entity.instanceMethods, ...entity.classMethods]) {
          if (tsShouldInclude(m)) methods.add(m.name);
        }

        if (entity.superclass) {
          const parent = resolveParent(entity.superclass, entity.file || "");
          if (parent) {
            for (const m of getInherited(parent, visited)) methods.add(m);
          }
        }

        for (const ext of entity.extends || []) {
          const parent = resolveParent(ext, entity.file || "");
          if (parent) {
            for (const m of getInherited(parent, visited)) methods.add(m);
          }
        }

        inheritedCache.set(key, methods);
        return methods;
      };

      for (const entity of [...Object.values(tsPkg.classes), ...Object.values(tsPkg.modules)]) {
        if (!entity.file) continue;
        const allMethods = getInherited(entity, new Set());
        const fileMethods = tsMethodsByFile.get(entity.file) || new Set();
        for (const m of allMethods) {
          fileMethods.add(m);
        }
        tsMethodsByFile.set(entity.file, fileMethods);
      }
    }

    // Collect all Ruby classes and modules with their methods
    const allRuby: {
      fqn: string;
      info: ClassInfo;
    }[] = [];

    // Skip nested classes that share a file with a shorter-named parent.
    // e.g., Preloader::Association::LoaderQuery in preloader/association.rb
    // is an implementation detail — its methods shouldn't inflate the parent's count.
    const primaryClassPerFile = new Map<string, string>();
    for (const [fqn, info] of Object.entries(rubyPkg.classes)) {
      const cls = info as unknown as ClassInfo;
      if (!cls.file) continue;
      const existing = primaryClassPerFile.get(cls.file);
      if (!existing || fqn.split("::").length < existing.split("::").length) {
        primaryClassPerFile.set(cls.file, fqn);
      }
    }

    for (const [fqn, info] of Object.entries(rubyPkg.classes)) {
      const cls = info as unknown as ClassInfo;
      // Skip nested classes in same file as a shorter-named parent
      if (cls.file) {
        const primary = primaryClassPerFile.get(cls.file);
        if (primary && primary !== fqn && fqn.startsWith(primary + "::")) continue;
      }
      allRuby.push({ fqn, info: cls });
    }

    // Fold ClassMethods into parent module
    const classMethodModuleFqns = new Set<string>();
    for (const [fqn, info] of Object.entries(rubyPkg.modules)) {
      if (!fqn.endsWith("::ClassMethods")) continue;
      const parentFqn = fqn.replace(/::ClassMethods$/, "");
      const parentMod = rubyPkg.modules[parentFqn] as unknown as ClassInfo | undefined;
      if (parentMod) {
        const mod = info as unknown as ClassInfo;
        for (const m of mod.instanceMethods) {
          if (!parentMod.classMethods.some((pm: MethodInfo) => pm.name === m.name)) {
            parentMod.classMethods.push(m);
          }
        }
        classMethodModuleFqns.add(fqn);
      }
    }

    for (const [fqn, info] of Object.entries(rubyPkg.modules)) {
      const mod = info as unknown as ClassInfo;
      if (classMethodModuleFqns.has(fqn)) continue;
      if (
        mod.instanceMethods.length === 0 &&
        mod.classMethods.length === 0 &&
        mod.includes.length === 0 &&
        mod.extends.length === 0
      ) {
        continue;
      }
      allRuby.push({ fqn, info: mod });
    }

    // Build module FQN → short name mapping for include resolution.
    // Ruby `include Predications` uses the short name, but the module FQN
    // might be `Arel::Predications`. Build both short and full lookups.
    const moduleFqnByShort = new Map<string, string[]>();
    for (const [fqn] of Object.entries(rubyPkg.modules)) {
      const short = fqn.split("::").pop()!;
      const list = moduleFqnByShort.get(short) || [];
      list.push(fqn);
      moduleFqnByShort.set(short, list);
    }

    // For each Ruby module, find the TS files of classes/modules that include it.
    // Resolved transitively: if Base includes Scoping and Scoping includes Named,
    // Named's methods should also be checked against base.ts.

    // Step 1: build direct include/extend graph (module FQN → includer FQNs)
    const moduleIncluderFqns = new Map<string, Set<string>>();
    const allClassesAndModules = [
      ...Object.entries(rubyPkg.classes).map(([fqn, info]) => ({
        fqn,
        info: info as unknown as ClassInfo,
      })),
      ...Object.entries(rubyPkg.modules).map(([fqn, info]) => ({
        fqn,
        info: info as unknown as ClassInfo,
      })),
    ];
    const fqnToFile = new Map<string, string>();
    for (const { fqn, info } of allClassesAndModules) {
      if (info.file) fqnToFile.set(fqn, info.file);
      for (const inc of [...(info.includes || []), ...(info.extends || [])]) {
        const resolved = moduleFqnByShort.get(inc) || [inc];
        for (const modFqn of resolved) {
          const includers = moduleIncluderFqns.get(modFqn) || new Set();
          includers.add(fqn);
          moduleIncluderFqns.set(modFqn, includers);
        }
      }
    }

    // Step 2: transitively resolve includer files (DFS with memoization)
    const moduleIncluderFiles = new Map<string, Set<string>>();
    const resolveIncluderFiles = (modFqn: string, visited: Set<string>): Set<string> => {
      const cached = moduleIncluderFiles.get(modFqn);
      if (cached) return cached;
      if (visited.has(modFqn)) return new Set();
      visited.add(modFqn);

      const files = new Set<string>();
      const includers = moduleIncluderFqns.get(modFqn);
      if (includers) {
        for (const incFqn of includers) {
          const file = fqnToFile.get(incFqn);
          if (file) files.add(rubyFileToTs(file, pkg));
          // Transitively: if incFqn is also a module, its includers count too
          for (const f of resolveIncluderFiles(incFqn, visited)) {
            files.add(f);
          }
        }
      }

      moduleIncluderFiles.set(modFqn, files);
      return files;
    };

    for (const [fqn] of Object.entries(rubyPkg.modules)) {
      resolveIncluderFiles(fqn, new Set());
    }

    // Group by Ruby file
    const byFile = new Map<string, typeof allRuby>();
    const excludedFiles = new Set<string>();
    for (const item of allRuby) {
      const file = item.info.file || "unknown.rb";
      if (isSourceUnported(file)) {
        excludedFiles.add(file);
        continue;
      }
      const list = byFile.get(file) || [];
      list.push(item);
      byFile.set(file, list);
    }

    // Resolve package src directory for file existence checks
    const pkgSrcDir = packageSrcDir(pkg);

    // Reverse index: TS method name → list of TS files defining it.
    // Used as a last-resort fallback when a Ruby file's expected TS path
    // doesn't exist but a sibling file in the same package implements
    // most of its methods (e.g. trailties' `commands/server/server_command.rb`
    // is implemented at `commands/server.ts`). Surfaces as a "misplaced"
    // file in the summary, mirroring how test:compare flags misplaced tests.
    const tsFilesByMethod = new Map<string, Set<string>>();
    for (const [tsFile, methods] of tsMethodsByFile) {
      for (const m of methods) {
        let set = tsFilesByMethod.get(m);
        if (!set) {
          set = new Set();
          tsFilesByMethod.set(m, set);
        }
        set.add(tsFile);
      }
    }

    // Compare methods per file
    let totalMatched = 0;
    let totalMissing = 0;
    let totalFiles = 0;
    let filesExist = 0;
    let totalMisplaced = 0;
    const fileResults: FileResult[] = [];

    for (const [rubyFile, items] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const expectedTs = rubyFileToTs(rubyFile, pkg);
      const tsMethods = tsMethodsByFile.get(expectedTs) || new Set<string>();
      const tsFileExists = fs.existsSync(path.join(pkgSrcDir, expectedTs));
      const missingMethods: MethodResult[] = [];
      const moves: MoveResult[] = [];
      let fileMatched = 0;
      let fileMissing = 0;

      // Collect all includer method sets for modules in this file,
      // tracking which file each set came from (for move detection)
      const allIncluderMethodSets: { file: string; methods: Set<string> }[] = [];
      for (const item of items) {
        const includerFiles = moduleIncluderFiles.get(item.fqn);
        if (includerFiles) {
          for (const f of includerFiles) {
            const methods = tsMethodsByFile.get(f);
            if (methods) allIncluderMethodSets.push({ file: f, methods });
          }
        }
      }

      // Deduplicate: collect all unique Ruby methods expected from this
      // file (keyed by Ruby method name, not first TS candidate, so two
      // distinct Ruby methods that camelize to the same first candidate
      // — e.g. `is_number?` and `number?` both → "isNumber" — both
      // survive). Multiple Ruby classes in the same file often define
      // the same method (e.g., 8 subclasses in binary.rb each override
      // `invert`). Count once.
      const seen = new Map<string, { rubyName: string; rubyModule: string }>();
      for (const item of items) {
        const f = flattenIncludedMethodInfos(item.info, item.fqn, rubyPkg, moduleFqnByShort);
        const rubyMethods = [...f.instance, ...f.klass];
        for (const rm of rubyMethods) {
          if (!methodMatchesMode(rm)) continue;
          dedupeRubyMethodInto(seen, rm, item.fqn);
        }
      }

      // Misplaced-file detection: tally per-sibling-file how many of
      // this Ruby file's expected TS candidates land there, then pick
      // the strongest cluster (see `selectMisplacedFile` for thresholds).
      let misplacedActualFile: string | null = null;
      if (!tsFileExists && seen.size > 0) {
        const fileHits = new Map<string, number>();
        for (const [, { rubyName }] of seen) {
          const candidates = rubyMethodToTs(rubyName);
          if (!candidates) continue;
          const containingFiles = new Set<string>();
          for (const c of candidates) {
            const files = tsFilesByMethod.get(c);
            if (files) for (const f of files) containingFiles.add(f);
          }
          for (const f of containingFiles) {
            fileHits.set(f, (fileHits.get(f) || 0) + 1);
          }
        }
        misplacedActualFile = selectMisplacedFile(fileHits, seen.size);
      }
      const actualMethods = misplacedActualFile
        ? tsMethodsByFile.get(misplacedActualFile) || new Set<string>()
        : null;

      for (const [_dedupeKey, { rubyName, rubyModule }] of seen) {
        const tsCandidates = rubyMethodToTs(rubyName)!;

        // Check direct match first — find which candidate matched
        const directMatch = tsCandidates.find((c) => tsMethods.has(c));
        if (directMatch) {
          fileMatched++;
          continue;
        }

        // Check include chain — track which candidate and file matched
        let foundViaInclude: string | null = null;
        let matchedCandidate: string | null = null;
        for (const candidate of tsCandidates) {
          for (const { file, methods } of allIncluderMethodSets) {
            if (methods.has(candidate)) {
              foundViaInclude = file;
              matchedCandidate = candidate;
              break;
            }
          }
          if (foundViaInclude) break;
        }

        if (foundViaInclude) {
          fileMatched++;
          moves.push({
            tsName: matchedCandidate!,
            rubyName,
            rubyModule,
            expectedFile: expectedTs,
            actualFile: foundViaInclude,
          });
          continue;
        }

        // Cross-file misplaced fallback: method exists in the cluster
        // file we identified above.
        if (actualMethods) {
          const misplacedMatch = tsCandidates.find((c) => actualMethods.has(c));
          if (misplacedMatch) {
            fileMatched++;
            moves.push({
              tsName: misplacedMatch,
              rubyName,
              rubyModule,
              expectedFile: expectedTs,
              actualFile: misplacedActualFile!,
            });
            continue;
          }
        }

        fileMissing++;
        missingMethods.push({ rubyName, tsName: tsCandidates[0], rubyModule });
      }

      const total = fileMatched + fileMissing;
      if (total === 0) continue;

      fileResults.push({
        rubyFile,
        expectedTsFile: expectedTs,
        tsFileExists,
        misplacedAt: misplacedActualFile ?? undefined,
        matched: fileMatched,
        missing: fileMissing,
        total,
        missingMethods,
        moves,
      });

      totalMatched += fileMatched;
      totalMissing += fileMissing;
      totalFiles++;
      if (tsFileExists) filesExist++;
      else if (misplacedActualFile) {
        totalMisplaced++;
        filesExist++;
      }
    }

    const totalMethods = totalMatched + totalMissing;
    const pct = totalMethods > 0 ? Math.round((totalMatched / totalMethods) * 1000) / 10 : 0;

    // ---- Inheritance check ----
    // For each primary Ruby class, locate the matching TS class (same expected
    // file + same short name) and verify Ruby's immediate superclass appears
    // somewhere in TS's ancestor chain. If the TS class is absent entirely,
    // surface that as a mismatch so regressions don't hide.
    const inheritance: InheritanceResult = { checked: 0, matched: 0, mismatches: [] };
    if (tsPkg) {
      // Index TS classes by (file, shortName) and by short name for ancestor walks.
      const tsByFileName = new Map<string, ClassInfo>();
      const tsByShort = new Map<string, ClassInfo[]>();
      for (const cls of Object.values(tsPkg.classes)) {
        if (!cls.file) continue;
        tsByFileName.set(`${cls.file}::${cls.name}`, cls);
        const list = tsByShort.get(cls.name) || [];
        list.push(cls);
        tsByShort.set(cls.name, list);
      }

      // Resolve the most likely parent class among duplicates by file-path
      // proximity, mirroring the `resolveParent` heuristic above.
      const resolveAncestor = (name: string, childFile: string): ClassInfo | null => {
        const candidates = tsByShort.get(name) || [];
        if (candidates.length === 0) return null;
        if (candidates.length === 1) return candidates[0];
        const childParts = (childFile || "").split("/");
        let best: ClassInfo | null = null;
        let bestScore = -1;
        for (const c of candidates) {
          if (c.file === childFile && c.name === name) continue;
          const parts = (c.file || "").split("/");
          let shared = 0;
          for (let i = 0; i < Math.min(childParts.length, parts.length); i++) {
            if (childParts[i] === parts[i]) shared++;
            else break;
          }
          if (shared > bestScore) {
            bestScore = shared;
            best = c;
          }
        }
        return best ?? candidates[0];
      };

      const ancestorChain = (cls: ClassInfo): string[] => {
        const chain: string[] = [];
        const seen = new Set<string>();
        let cursor: ClassInfo | null = cls;
        while (cursor?.superclass) {
          const name = shortName(cursor.superclass);
          if (!name) break;
          chain.push(name);
          const key = `${cursor.file}::${name}`;
          if (seen.has(key)) break;
          seen.add(key);
          cursor = resolveAncestor(name, cursor.file || "");
        }
        return chain;
      };

      for (const { fqn, info } of allRuby) {
        if (!info.file || isSourceUnported(info.file)) continue;
        if (primaryClassPerFile.get(info.file) !== fqn) continue;
        // `allRuby` mixes classes and modules; modules don't carry superclass.
        if (!(fqn in rubyPkg.classes)) continue;

        const expectedTs = rubyFileToTs(info.file, pkg);
        const short = shortName(fqn)!;
        const rubySuper = shortName(info.superclass);

        const tsCls = resolveTsClassForRuby(short, expectedTs, tsByFileName);
        inheritance.checked++;

        if (!tsCls) {
          // If the method-comparison already flags the TS file as missing,
          // don't double-count a ts-class-missing — the file-level signal
          // covers it. Only surface when the file exists but this class is
          // absent (a genuine inheritance blind spot).
          const pkgSrcDir = packageSrcDir(pkg);
          const fileExists = fs.existsSync(path.join(pkgSrcDir, expectedTs));
          if (!fileExists) {
            inheritance.checked--; // don't score; file-missing is tracked elsewhere
            continue;
          }
          inheritance.mismatches.push({
            rubyFqn: fqn,
            rubyFile: info.file,
            tsFile: expectedTs,
            tsName: short,
            rubySuper,
            tsSuper: null,
            tsChain: [],
            reason: "ts-class-missing",
          });
          continue;
        }

        const chain = ancestorChain(tsCls);
        // Pass the resolved TS class name (not the Ruby short name) so
        // the `TS_ROOT_INTERMEDIATE` whitelist keys on what the TS file
        // actually declares (e.g. "ValueType", not Ruby's "Value").
        if (superclassesMatch(rubySuper, chain, tsCls.name)) {
          inheritance.matched++;
        } else {
          inheritance.mismatches.push({
            rubyFqn: fqn,
            rubyFile: info.file,
            tsFile: expectedTs,
            tsName: short,
            rubySuper,
            tsSuper: chain[0] ?? null,
            tsChain: chain,
            reason: "super-mismatch",
          });
        }
      }
    }

    results.push({
      package: pkg,
      totalMethods,
      matched: totalMatched,
      missing: totalMissing,
      percent: pct,
      totalFiles,
      filesExist,
      misplacedFiles: totalMisplaced,
      excludedFiles: [...excludedFiles].sort(),
      files: fileResults,
      inheritance,
    });
  }

  // Write JSON. Separate file per mode so artifacts don't clobber each
  // other when multiple runs land back-to-back in CI.
  const jsonFilename =
    mode === "private"
      ? "api-comparison-privates-only.json"
      : mode === "public"
        ? "api-comparison-public-only.json"
        : "api-comparison.json";
  const jsonPath = path.join(OUTPUT_DIR, jsonFilename);
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );

  printReport(results, showMissing, showFiles, filterPkg, showIncomplete, showInheritance, mode);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(
  results: PackageResult[],
  showMissing: boolean,
  showFiles: boolean,
  filterPkg: string | null,
  showIncomplete = false,
  showInheritance = false,
  mode: CompareMode = "public",
) {
  if (mode === "private") {
    console.log(
      `\n  (comparing internal/private API surface — ` +
        `Ruby private/protected, TS private/protected, TS #-prefixed fields)`,
    );
  } else if (mode === "all") {
    console.log(`\n  (comparing full API surface — public + private/protected combined)`);
  }
  let grandTotal = 0;
  let grandMatched = 0;
  let grandFiles = 0;
  let grandFilesExist = 0;
  let grandInhChecked = 0;
  let grandInhMatched = 0;

  for (const pkg of results) {
    grandTotal += pkg.totalMethods;
    grandMatched += pkg.matched;
    grandFiles += pkg.totalFiles;
    grandFilesExist += pkg.filesExist;
    grandInhChecked += pkg.inheritance.checked;
    grandInhMatched += pkg.inheritance.matched;

    console.log(`\n${"=".repeat(100)}`);
    const excludedNote =
      pkg.excludedFiles.length > 0 ? "  (some intentionally excluded, see unported-files.ts)" : "";
    const inh = pkg.inheritance;
    const inhPct = inh.checked > 0 ? Math.round((inh.matched / inh.checked) * 1000) / 10 : 0;
    const inhNote =
      inh.checked > 0 ? `  |  inheritance: ${inh.matched}/${inh.checked} (${inhPct}%)` : "";
    const misplacedNote = pkg.misplacedFiles > 0 ? `  |  ${pkg.misplacedFiles} misplaced` : "";
    console.log(
      `  ${pkg.package}  —  ${pkg.matched}/${pkg.totalMethods} methods (${pkg.percent}%)  |  files: ${pkg.filesExist}/${pkg.totalFiles}${misplacedNote}${inhNote}${excludedNote}`,
    );
    console.log(`${"=".repeat(100)}`);

    if (showInheritance && inh.mismatches.length > 0) {
      console.log(`\n  Inheritance mismatches:`);
      for (const m of inh.mismatches) {
        if (m.reason === "ts-class-missing") {
          const rs = m.rubySuper ?? "(none)";
          console.log(`    ${m.tsFile}:${m.tsName}  ruby<${rs}>  ts<class missing>`);
          continue;
        }
        const rs = m.rubySuper ?? "(none)";
        const tsDesc = m.tsChain.length > 0 ? m.tsChain.join(" → ") : "(none)";
        console.log(`    ${m.tsFile}:${m.tsName}  ruby<${rs}>  ts<${tsDesc}>`);
      }
    }

    // Per-file table (only for detail packages or when filtered)
    if (DETAIL_PACKAGES.has(pkg.package) || filterPkg || showFiles) {
      console.log(
        `\n  ${"Ruby file".padEnd(55)} ${"Expected TS file".padEnd(40)} ${"Match".padStart(6)} ${"Miss".padStart(6)} ${"Tot".padStart(6)}  %`,
      );
      console.log(
        `  ${"-".repeat(55)} ${"-".repeat(40)} ${"-".repeat(6)} ${"-".repeat(6)} ${"-".repeat(6)} ${"-".repeat(4)}`,
      );

      for (const f of pkg.files) {
        const pct = f.total > 0 ? Math.round((f.matched / f.total) * 100) : 0;
        const fullyMatched = f.total > 0 && f.matched === f.total;
        // A misplaced file is "incomplete" even at 100% match \u2014 the
        // file still needs to move to its conventional path.
        if (showIncomplete && fullyMatched && !f.misplacedAt) continue;
        const marker = f.misplacedAt
          ? ` \u21a6 ${f.misplacedAt}`
          : !f.tsFileExists
            ? " \u2717"
            : fullyMatched
              ? " \u2713"
              : "";
        console.log(
          `  ${f.rubyFile.padEnd(55)} ${f.expectedTsFile.padEnd(40)} ${String(f.matched).padStart(6)} ${String(f.missing).padStart(6)} ${String(f.total).padStart(6)} ${String(pct).padStart(3)}%${marker}`,
        );

        if (showMissing) {
          for (const m of f.missingMethods) {
            console.log(`      - ${m.rubyName} → ${m.tsName}`);
          }
        }
      }
    }
  }

  // Data layer summary (arel + activemodel + activerecord)
  const DATA_LAYER = new Set(["arel", "activemodel", "activerecord"]);
  let dataTotal = 0;
  let dataMatched = 0;
  let dataFiles = 0;
  let dataFilesExist = 0;
  for (const pkg of results) {
    if (DATA_LAYER.has(pkg.package)) {
      dataTotal += pkg.totalMethods;
      dataMatched += pkg.matched;
      dataFiles += pkg.totalFiles;
      dataFilesExist += pkg.filesExist;
    }
  }

  const grandPct = grandTotal > 0 ? Math.round((grandMatched / grandTotal) * 1000) / 10 : 0;
  const dataPct = dataTotal > 0 ? Math.round((dataMatched / dataTotal) * 1000) / 10 : 0;
  console.log(`\n${"=".repeat(100)}`);
  if (dataTotal > 0 && dataTotal !== grandTotal) {
    console.log(
      `  Data layer: ${dataMatched}/${dataTotal} methods (${dataPct}%)  |  files: ${dataFilesExist}/${dataFiles}`,
    );
  }
  const inhPct =
    grandInhChecked > 0 ? Math.round((grandInhMatched / grandInhChecked) * 1000) / 10 : 0;
  const inhSummary =
    grandInhChecked > 0
      ? `  |  inheritance: ${grandInhMatched}/${grandInhChecked} (${inhPct}%)`
      : "";
  console.log(
    `  Overall: ${grandMatched}/${grandTotal} methods (${grandPct}%)  |  files: ${grandFilesExist}/${grandFiles}${inhSummary}`,
  );
  console.log(`${"=".repeat(100)}\n`);
}

// Only run the CLI when invoked as a script. `import`s (e.g. from tests)
// should be able to pull in exported helpers without triggering main().
const invokedAsScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("compare.ts");
if (invokedAsScript) main();
