#!/usr/bin/env -S npx tsx
/**
 * Surface TypeScript files whose public API has drifted *beyond* their Rails
 * counterpart — the inverse of `api:compare`.
 *
 * `api:compare` reports Rails methods missing in TS. This script reports TS
 * public methods/functions/getters/setters that don't correspond to any
 * Ruby method in the matched Rails file. It's a fact-finding audit so we
 * can prune toward Rails-faithful shape; it never modifies source.
 *
 * Algorithm, per Rails-mirroring package:
 *   1. For each Ruby file, resolve its expected TS file via `rubyFileToTs`.
 *   2. Collect Ruby methods declared in (or `include`d into) the entities in
 *      that Ruby file — any visibility, since a TS method mirroring a
 *      Rails-private method exists in Rails (a visibility divergence, not
 *      extra surface). Map each to its TS-candidate name set via
 *      `rubyMethodCandidates`, which also resolves `conventions.SKIP`
 *      mirrors (`freeze`, `to_a`, `lookup_cast_type`) so a TS override is
 *      allowed in the file where Ruby defines the method. Union = the
 *      "allowed" TS name set.
 *   3. Collect public TS names declared in the matching TS file — each
 *      class/module's *own* methods (skipping inherited surface so the
 *      diff measures this file's drift, not its ancestor's) plus top-level
 *      `fileFunctions`. Filter out `internal: true` (Ruby private/protected,
 *      TS private/protected, TS `#`-prefixed fields, and `@internal` JSDoc
 *      on a top-level exported function) and
 *      separately filter `_`-prefixed names — the extractor keeps those as
 *      public exports; the Rails-private convention in this repo means they
 *      should not count toward extra surface.
 *   4. Extra = TS names \ allowed names. Emit per-file, per-package, and
 *      top-N reports.
 *
 * Manifests are produced by `pnpm api:compare`; if they're missing the
 * script bails with a hint (same convention as `api:moves`).
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/extra-surface.ts \
 *     [--package <name>] [--top <N>] [--json] [--exclude-glob <glob>]...
 *
 * Each extra is classified as **novel** (the candidate name appears nowhere
 * in Rails-land) or **moved** (Rails defines it, just in a different `.rb`).
 * Files are ranked by novel count primarily — barrel-style aggregators
 * (`connection-adapters.ts`) drop below smaller novel-heavy files like
 * `relation/finder-methods.ts`. `--novel-only` drops moved extras entirely.
 *
 * Flags:
 *   --package <name>      Restrict to one package (e.g. activerecord).
 *   --top <N>             Top-N most-divergent files (default 50).
 *   --json                Emit machine-readable JSON to stdout instead of
 *                         the human report.
 *   --exclude-glob <g>    Skip TS files matching <g> (substring match
 *                         against the TS file path). Repeatable. Useful
 *                         for known-intentional extensions like
 *                         `dx-tests/` or `defineSchema`-only modules.
 *   --novel-only          Drop moved-not-novel extras (filters barrel noise).
 *   --max-detail <N>      Cap names per file in detail listing (default 40).
 *   --help                Print this message.
 */

import * as fs from "fs";
import * as fsp from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";
import { OUTPUT_DIR } from "./config.js";
import {
  SKIP,
  SKIP_TS_MIRROR_IS_DRIFT,
  rubyFileToTs,
  rubyMethodToTs,
  rubyMethodToTsIgnoringSkip,
  snakeToCamel,
} from "./conventions.js";
import { resolveModuleName } from "./compare.js";
import { isSourceUnported } from "./unported-files.js";

/**
 * Track the FQN alongside the entity so namespace-scoped include resolution
 * (`resolveModuleName(short, fqn, …)`) picks the *enclosing* module —
 * e.g. `AbstractAdapter` including `"Quoting"` resolves to
 * `ConnectionAdapters::Quoting`, not the adapter-specific siblings.
 */
interface RubyEntity {
  fqn: string;
  info: ClassInfo;
}

/**
 * Mixins (and methods) a host class gains at *runtime* via a gem's railtie
 * `ActiveSupport.on_load(:active_record)` block rather than a lexical `include`
 * in the host's own source. The static Ruby extractor only sees `include`s
 * written inside the class/module body, so a railtie-injected mixin never
 * lands in the host's `includes` array and its faithful TS ports look novel.
 *
 * `includes` are resolved against the *cross-package* module map (every
 * package's extracted modules), so a mixin defined in a different gem —
 * e.g. `GlobalID::Identification` (globalid package) included into
 * `ActiveRecord::Base` (activerecord package) by globalid's railtie — still
 * contributes its instance methods to the host's allowed set.
 *
 * `methods` are raw Ruby method names the railtie surface implies but which
 * have no static `def` anywhere (so they can't be reached via a module): the
 * trails-side ergonomic finders that the globalid `wire` side-effect module
 * registers onto `Base` (`find_global_id` → `GlobalID::Locator.locate`,
 * `find_signed_global_id[!]` → `locateSigned`). Rails apps call
 * `GlobalID::Locator.locate` directly; trails surfaces the model-side form.
 */
const AMBIENT_RAILTIE_MIXINS: Record<string, { includes?: string[]; methods?: string[] }> = {
  "ActiveRecord::Base": {
    includes: ["GlobalID::Identification"],
    methods: ["find_global_id", "find_signed_global_id", "find_signed_global_id!"],
  },
};

/**
 * Methods a Rails file's host class/module gains by including a mixin whose
 * SOURCE file is on `UNPORTED_FILES` — so `collectAllowedNames`'s `walkMixin`
 * skips the mixin (mirroring `compare.flattenIncludedMethodInfos` at
 * compare.ts:507) and the faithful TS ports look like unexplained "moved"
 * extras. We DID port these methods, just as standalone mirrors that don't go
 * through the unported module, so list them here keyed by the Ruby host FQN to
 * fold the ported names back into the host's allowed set. Applied like
 * `AMBIENT_RAILTIE_MIXINS.methods` (raw Ruby names → `addRubyName`), but the
 * justification is a source-unported *lexical* include rather than a railtie
 * `on_load` injection.
 *
 *   - `ActiveRecord::Railtie` re-exports `Railties::ControllerRuntime`
 *     (railtie.rb:267 — `on_load(:action_controller) { include … }`); the port
 *     lives in `trailties/controller-runtime.ts`. Its source (vendored at
 *     `activerecord/lib/active_record/railties/controller_runtime.rb`, matched
 *     by the `railties/controller_runtime.rb` UNPORTED_FILES pattern) is
 *     unported (Railties / ActionController integration not ported yet).
 *   - The association error classes `include DidYouMean::Correctable`
 *     (associations/errors.rb:18,47,88); `Correctable#detailed_message` is
 *     ported inline as `detailedMessage` in `associations/errors.ts`.
 *     Correctable's source `core_ext/name_error.rb` is unported (Ruby NameError
 *     machinery with no JS analog). Keyed on one host class since `allowed` is
 *     unioned per-file across every entity in errors.rb.
 */
const PORTED_UNPORTED_MIXIN_METHODS: Record<string, string[]> = {
  "ActiveRecord::Railtie": ["process_action", "cleanup_view_runtime", "append_info_to_payload"],
  "ActiveRecord::AssociationNotFoundError": ["detailed_message"],
};

/**
 * Extra TS candidates for Ruby names the normal case-transform can't spell.
 *
 * `to_a`/`to_ary` camelize to `toA`/`toAry`; the JS spelling of that protocol
 * is `toArray`. `==` is an operator — TS has no operator overloading, so the
 * port is a named `equals`. Ruby copy semantics come from `Object#clone`/`#dup`
 * (never `def`ed in Rails) plus the `initialize_copy` hook the class DOES
 * define; JS has no `Object#clone`, so the faithful port of that pair is a
 * `clone`/`dup` method on the class.
 */
const MIRROR_CANDIDATE_OVERRIDES: Record<string, string[]> = {
  to_a: ["toArray"],
  to_ary: ["toArray"],
  "==": ["equals"],
  initialize_copy: ["clone", "dup"],
  initialize_dup: ["dup"],
  initialize_clone: ["clone"],
};

/**
 * TS candidates for a Ruby method `rubyMethodToTs` refuses to map.
 *
 * `conventions.SKIP` means api:compare never expects a TS counterpart, but the
 * Ruby method still EXISTS in the file — so a TS override of it (`freeze`,
 * `inspect`, `lookupCastType`) is Rails-faithful, not drift. Mapping those
 * names here keeps the allowance *file-scoped*: `freeze` is allowed in core.ts
 * because core.rb defines `freeze`, and stays flagged anywhere Ruby doesn't.
 * That's strictly tighter than the blanket in-file allow-set this replaced.
 *
 * Two exclusions: `SKIP_TS_MIRROR_IS_DRIFT` names (Ruby hooks — a same-named
 * TS method is a trails invention, not a port), and anything neither on SKIP
 * nor in the override map, so ordinary unmapped names (operators other than
 * `==`) stay unmapped.
 */
function skipMirrorCandidates(rubyName: string): string[] | null {
  if (SKIP_TS_MIRROR_IS_DRIFT.has(rubyName)) return null;
  const overrides = MIRROR_CANDIDATE_OVERRIDES[rubyName];
  if (!SKIP.has(rubyName) && !overrides) return null;
  const candidates = [...(rubyMethodToTsIgnoringSkip(rubyName) ?? []), ...(overrides ?? [])];
  return candidates.length > 0 ? candidates : null;
}

/**
 * `rubyMethodToTs` for any method, falling back to `skipMirrorCandidates` for
 * the names it refuses, plus the trails `Q`-suffix predicate form.
 * trails encodes a Ruby `?` predicate with a trailing `Q` in TS
 * (`connected_to?` → `connectedToQ`), sometimes stacked on the is-prefix form
 * (`connected?` → `isConnectedQ`). The base mapper only emits the is-prefix
 * and plain forms, so without the `Q` variants every ported predicate is
 * mis-flagged as novel. Append `Q` to each candidate of a `?` method.
 */
function rubyMethodCandidates(rubyName: string): string[] | null {
  const base = rubyMethodToTs(rubyName) ?? skipMirrorCandidates(rubyName);
  if (!base) return null;
  if (!rubyName.endsWith("?")) return base;
  return [...base, ...base.map((c) => c + "Q")];
}

/**
 * TS-candidate names for a Ruby file-level constant. Constants aren't
 * case-transformed on the way over — `ER_DUP_ENTRY` ports verbatim — so the
 * name itself is always a candidate. The camelized form is the second
 * candidate, keeping scoring in lockstep with `constantNameMatches`
 * (literals.ts), which the literal-value comparison already uses to pair a
 * Ruby constant with its TS counterpart; scoring the two passes off different
 * name rules would let a constant compare as a value yet still read as drift.
 *
 * The camelized form is emitted only for multi-token SCREAMING_SNAKE names —
 * the ones where camelizing produces a case transition (`ER_DUP_ENTRY` →
 * `erDupEntry`) that could only have come from a constant. A single-token name
 * camelizes to a bare lowercase word indistinguishable from an ordinary method
 * name, whether it started CamelCase (`Version = Gem::Version`) or SCREAMING
 * (`VERSION = "10.0.0"`, arel.rb:29) — `snakeToCamel` is a no-op without a `_`
 * to drive capitalization, so both collapse to `version`. Admitting that would
 * silently absolve a genuinely novel TS `version` everywhere the allow-set is
 * unioned in, a far worse trade than the one drift-read it saves.
 *
 * This is deliberately narrower than `constantNameMatches`, which may pair
 * `VERSION` with a TS `version` for value comparison. Pairing a *known* TS
 * constant to diff its value is safe; minting a lowercase allow-set entry that
 * any method name can collide with is not.
 */
function rubyConstantCandidates(name: string): string[] {
  if (!/^[A-Z0-9]+(_[A-Z0-9]+)+$/.test(name)) return [name];
  const camel = snakeToCamel(name.toLowerCase());
  return camel === name ? [name] : [name, camel];
}

/** Get-or-init helper: replaces the `(get() ?? set([]).get()!).push(v)` idiom. */
function pushTo<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

/**
 * An extra TS name is **moved** if a Ruby method somewhere in Rails-land
 * camelizes to it (just not in the matched file). It's **novel** when no
 * Ruby method anywhere produces it — that's the high-signal class:
 * helpers, accidental public surface, TS-only ergonomics. Barrel files
 * like `connection-adapters.ts` are mostly `moved`; small focused files'
 * extras are mostly `novel`.
 */
export type ExtraKind = "novel" | "moved";

export interface AllowEntry {
  package: string;
  tsFile: string;
  name: string;
  reason: string;
}

export const ALLOWLIST_PATH = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "extra-surface-allow.json",
);

export function allowKeyOf(e: { package: string; tsFile: string; name: string }): string {
  return `${e.package} ${e.tsFile} ${e.name}`;
}

/**
 * Every `@noRailsEquivalent`-tagged declaration in the TS manifest, as
 * allowlist entries (RFC 0080). The tag is the inline successor of
 * extra-surface-allow.json: both sources are honored during the migration
 * window and both feed the same `Allowed` totals. Keyed by the CONTAINER's
 * file, matching how `collectTsFileNames` gathers the names it compares.
 * Keys are deduped: one declaration reaches many hosts (the mixin object, the
 * install site, the auto-synthesized file module), so the same key arrives
 * repeatedly and would otherwise inflate the tag total.
 */
export function collectTaggedEntries(ts: ApiManifest): AllowEntry[] {
  const out: AllowEntry[] = [];
  const seen = new Set<string>();
  const push = (pkg: string, tsFile: string, m: MethodInfo): void => {
    if (m.noRailsEquivalent === undefined) return;
    const entry = { package: pkg, tsFile, name: m.name, reason: m.noRailsEquivalent };
    const key = allowKeyOf(entry);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(entry);
  };
  for (const [pkg, tsPkg] of Object.entries(ts.packages)) {
    for (const container of [tsPkg.classes, tsPkg.modules]) {
      for (const c of Object.values(container) as ClassInfo[]) {
        if (!c.file || c.reExportedFrom) continue;
        for (const m of c.instanceMethods) push(pkg, c.file, m);
        for (const m of c.classMethods) push(pkg, c.file, m);
      }
    }
    for (const [file, fns] of Object.entries(tsPkg.fileFunctions ?? {})) {
      for (const fn of fns) push(pkg, file, fn);
    }
  }
  return out;
}

export function findInvalidAllowEntries(entries: AllowEntry[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const e of entries) {
    const key = allowKeyOf(e);
    if (!e.package || !e.tsFile || !e.name) {
      problems.push(`incomplete key: ${JSON.stringify(e)}`);
      continue;
    }
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      problems.push(`empty reason: ${key}`);
    }
    if (seen.has(key)) problems.push(`duplicate key: ${key}`);
    seen.add(key);
  }
  return problems;
}

export async function loadAllowlist(file: string = ALLOWLIST_PATH): Promise<AllowEntry[]> {
  let raw: string;
  try {
    raw = await fsp.readFile(file, "utf-8");
  } catch {
    throw new Error(
      `Missing ${path.basename(file)} — the allowlist file must exist (\`[]\` when empty).`,
    );
  }
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${path.basename(file)} must be a JSON array of allowlist entries.`);
  }
  return parsed as AllowEntry[];
}

export interface ExtraName {
  name: string;
  kind: ExtraKind;
}

interface ExtraFile {
  package: string;
  tsFile: string;
  rubyFile: string;
  extraCount: number;
  novelCount: number;
  movedCount: number;
  allowlistedCount: number;
  extras: ExtraName[];
}

interface PackageTotals {
  package: string;
  filesWithDrift: number;
  totalExtras: number;
  totalNovel: number;
  totalMoved: number;
  totalAllowlisted: number;
  extraFiles: ExtraFile[];
}

interface AllowlistSummary {
  total: number;
  matched: number;
  stale: AllowEntry[];
}

interface Report {
  generatedAt: string;
  packages: PackageTotals[];
  topN: ExtraFile[];
  allowlist: AllowlistSummary;
  /**
   * `@noRailsEquivalent` tags found in the TS manifest. Additive to the
   * existing shape — the `allowlist` summary and every count above keep
   * their meaning for the stats-DB consumer.
   */
  tagged: AllowlistSummary;
}

const HELP = `extra-surface — TS files with public API exceeding their Rails counterpart

Usage:
  pnpm tsx scripts/api-compare/extra-surface.ts [options]

Options:
  --package <name>     Restrict to one package (e.g. activerecord)
  --top <N>            Top-N most-divergent files (default 50)
  --json               Emit JSON to stdout instead of the human report
  --exclude-glob <g>   Skip TS files containing substring <g> (repeatable)
  --novel-only         Only count/show extras that don't appear ANYWHERE
                       in the Rails source (filters out moved-not-novel
                       drift; rank order also flips to novel-first)
  --max-detail <N>     Per-file detail listing cap (default 40 names;
                       0 = unlimited)
  --help               This message

Reasoned allowlist: extra-surface-allow.json lists justified extras keyed by
package + tsFile + name (each with a non-empty reason). Allowed extras are
subtracted from the novel/moved counts and reported as an "Allowed" total;
an entry that no longer flags is STALE and fails the run.

Requires: pnpm api:compare must have run first to produce
  scripts/api-compare/output/{rails-api.json,ts-api.json}.
`;

export interface CliArgs {
  filterPkg: string | null;
  topN: number;
  json: boolean;
  excludeGlobs: string[];
  novelOnly: boolean;
  maxDetail: number;
}

export function parseArgs(argv: string[]): CliArgs {
  let filterPkg: string | null = null;
  let topN = 50;
  let json = false;
  let novelOnly = false;
  let maxDetail = 40;
  const excludeGlobs: string[] = [];

  const requireValue = (flag: string, v: string | undefined): string => {
    if (!v || v.startsWith("--")) {
      console.error(`${flag} requires a value`);
      process.exit(1);
    }
    return v;
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      console.log(HELP);
      process.exit(0);
    } else if (a === "--package") {
      filterPkg = requireValue("--package", argv[++i]);
    } else if (a === "--top") {
      const n = Number(requireValue("--top", argv[++i]));
      if (!Number.isInteger(n) || n <= 0) {
        console.error("--top requires a positive integer");
        process.exit(1);
      }
      topN = n;
    } else if (a === "--max-detail") {
      const n = Number(requireValue("--max-detail", argv[++i]));
      if (!Number.isInteger(n) || n < 0) {
        console.error("--max-detail requires a non-negative integer");
        process.exit(1);
      }
      maxDetail = n;
    } else if (a === "--json") {
      json = true;
    } else if (a === "--novel-only") {
      novelOnly = true;
    } else if (a === "--exclude-glob") {
      excludeGlobs.push(requireValue("--exclude-glob", argv[++i]));
    } else {
      console.error(`Unknown flag: ${a}`);
      console.error(HELP);
      process.exit(1);
    }
  }
  return { filterPkg, topN, json, excludeGlobs, novelOnly, maxDetail };
}

/**
 * Collect public TS names declared *in this file's own entities* — no
 * inherited surface. Inherited names that the parent already defines are
 * not "drift" relative to Rails; they're the parent's problem (and Rails
 * inherits them too).
 *
 * The extractor keeps `_`-prefixed exports as public (only Ruby
 * `private`/`protected`, TS `private`/`protected`, `#`-prefixed fields,
 * and `@internal` JSDoc on a top-level exported function set
 * `internal: true`; class/module members take the flag from their TS
 * visibility modifier only). The Rails-private
 * convention in this repo means we filter `_`-prefix here too.
 */
export function collectTsFileNames(
  file: string,
  classes: ClassInfo[],
  modules: ClassInfo[],
  fileFunctions: MethodInfo[] | undefined,
): Set<string> {
  const out = new Set<string>();
  const push = (m: MethodInfo): void => {
    if (m.internal === true) return;
    if (m.name.startsWith("_")) return;
    out.add(m.name);
  };
  for (const c of classes) {
    if (c.file !== file) continue;
    for (const m of c.instanceMethods) push(m);
    for (const m of c.classMethods) push(m);
  }
  for (const m of modules) {
    if (m.file !== file) continue;
    const skipForeign = m.synthesizedMixin === true;
    for (const im of m.instanceMethods) {
      if (skipForeign && im.declaredIn !== undefined) continue;
      push(im);
    }
    for (const cm of m.classMethods) {
      if (skipForeign && cm.declaredIn !== undefined) continue;
      push(cm);
    }
  }
  for (const fn of fileFunctions ?? []) push(fn);
  return out;
}

/**
 * Pre-fold `Foo::ClassMethods` submodules (the `ActiveSupport::Concern`
 * idiom) into `Foo.classMethods`, mirroring compare.ts's pre-pass. This
 * pre-fold lives in compare.ts at the consumer level (not in the Ruby
 * extractor), so we replicate it here for the same semantics: when a host
 * `include Foo`, the host gains `Foo::ClassMethods`'s instanceMethods as
 * class methods even though only `Foo` is named in the include list.
 *
 * Returns the set of FQNs that were merged-and-skip-listed so the caller
 * doesn't double-count them when iterating modules.
 */
function foldClassMethodsModules(modules: Record<string, ClassInfo>): Set<string> {
  const folded = new Set<string>();
  for (const [fqn, info] of Object.entries(modules)) {
    if (!fqn.endsWith("::ClassMethods")) continue;
    const parentFqn = fqn.replace(/::ClassMethods$/, "");
    const parent = modules[parentFqn];
    if (!parent) continue;
    for (const m of info.instanceMethods) {
      if (!parent.classMethods.some((pm) => pm.name === m.name)) {
        parent.classMethods.push(m);
      }
    }
    folded.add(fqn);
  }
  return folded;
}

/**
 * For one Ruby file's entities, compute the union of all TS candidate names
 * produced by `rubyMethodToTs`. Mirrors `compare.flattenIncludedMethodInfos`
 * mixin routing exactly:
 *
 *   - `include M`: M's instance methods land on the host as instance methods.
 *     A nested `include N` inside M chains through (instance methods only).
 *     M's own `extend` chain does NOT propagate to the host — Ruby `extend`
 *     affects only the receiver's singleton class.
 *   - `extend M` (at host level): M's instance methods land as class methods.
 *   - Module `classMethods` are NOT propagated through include/extend (Ruby
 *     semantics; `flattenIncludedMethodInfos` only pushes `instanceMethods`).
 *     The `ActiveSupport::Concern` "class methods via include" pattern is
 *     handled by `foldClassMethodsModules` above, which moves the nested
 *     `ClassMethods` submodule's instanceMethods into the parent's own
 *     `classMethods` — flattening still only reads `instanceMethods`, so
 *     ASC class methods become entity-level surface, not propagated mixins.
 *   - A mixin whose source file is unported (`UNPORTED_FILES`) is skipped, so
 *     its methods never enter `allowed` — matching the `isSourceUnported`
 *     guard at compare.ts:507. The check uses the module's *owning* package.
 *
 * The matched file's `fileConstants` names join `allowed` too (see
 * `rubyConstantCandidates`): a faithfully-ported `ER_DUP_ENTRY` is not extra
 * surface. Constants have no mixin routing — they belong to the file, not to
 * an entity — so they're added once up front rather than per entity.
 *
 * Since `allowed` is a flat name set (instance vs class collapsed on the TS
 * side anyway), we simply union both `instanceMethods` and `classMethods`
 * for the *host* entity, but ONLY `instanceMethods` for walked-into mixins.
 *
 * `include` names are resolved via compare.ts's `resolveModuleName`, which
 * walks namespace prefixes — `AbstractAdapter` including `"Quoting"` maps
 * only to `ConnectionAdapters::Quoting`, never to PG/MySQL siblings of the
 * same short name. Cross-package / stdlib mixins are silently skipped.
 */
function collectAllowedNames(
  entities: RubyEntity[],
  pkg: string,
  rubyModules: Record<string, ClassInfo>,
  moduleFqnByShort: Map<string, string[]>,
  crossPackageModules: Record<string, ClassInfo>,
  crossPackagePkgByFqn: Record<string, string>,
  fileConstantNames: string[],
): Set<string> {
  const allowed = new Set<string>();
  // File-level constants are declared per Ruby *file*, not per entity, so they
  // enter the allow-set once for the whole file rather than through the
  // entity/mixin walk below.
  for (const name of fileConstantNames) {
    for (const c of rubyConstantCandidates(name)) allowed.add(c);
  }
  const visited = new Set<string>();

  const addMethods = (methods: MethodInfo[]): void => {
    for (const m of methods) {
      // Private/protected Ruby methods (internal) still count: a TS method
      // mirroring a Rails-private method isn't *extra* surface, it's a
      // visibility divergence — the method exists in Rails. Excluding them
      // here would mislabel every public-port-of-a-private-method as drift.
      const candidates = rubyMethodCandidates(m.name);
      if (!candidates) continue;
      for (const c of candidates) allowed.add(c);
    }
  };

  const addRubyName = (rubyName: string): void => {
    const candidates = rubyMethodCandidates(rubyName);
    if (!candidates) return;
    for (const c of candidates) allowed.add(c);
  };

  const walkMixin = (incName: string, contextFqn: string): void => {
    const fqn = resolveModuleName(incName, contextFqn, moduleFqnByShort);
    if (visited.has(fqn)) return;
    visited.add(fqn);
    // Fall back to the cross-package map: a railtie-injected mixin (see
    // AMBIENT_RAILTIE_MIXINS) or a fully-qualified cross-gem include lives
    // in another package's modules, not this package's.
    const localMod = rubyModules[fqn];
    const mod = localMod ?? crossPackageModules[fqn];
    if (!mod) return;
    // A module whose source file we've explicitly declined to port should
    // not contribute its methods to the host's allowed set — otherwise an
    // unported mixin still flips its TS ports from extra surface to allowed.
    // Mirrors compare.flattenIncludedMethodInfos (compare.ts:507). Resolve
    // `isSourceUnported` against the module's *owning* package: a local
    // module's owner is the host `pkg`, a cross-package module's owner is
    // the package it was extracted from (package-scoped unported patterns
    // key off the owner, not the host).
    const ownerPkg = localMod ? pkg : (crossPackagePkgByFqn[fqn] ?? pkg);
    if (mod.file && isSourceUnported(mod.file, ownerPkg)) return;
    // Only the module's instance methods cross into the host. Class
    // methods on the module itself stay on the module (Ruby `include`
    // semantics; matches compare.flattenIncludedMethodInfos).
    addMethods(mod.instanceMethods);
    // Chain `include`s only — a module's own `extend` doesn't propagate
    // (Ruby singleton-class semantics).
    for (const inc of mod.includes ?? []) walkMixin(inc, fqn);
  };

  for (const { fqn, info } of entities) {
    addMethods(info.instanceMethods);
    addMethods(info.classMethods);
    for (const inc of info.includes ?? []) walkMixin(inc, fqn);
    for (const ext of info.extends ?? []) walkMixin(ext, fqn);

    const ambient = AMBIENT_RAILTIE_MIXINS[fqn];
    if (ambient) {
      for (const inc of ambient.includes ?? []) walkMixin(inc, fqn);
      for (const name of ambient.methods ?? []) addRubyName(name);
    }

    for (const name of PORTED_UNPORTED_MIXIN_METHODS[fqn] ?? []) addRubyName(name);
  }
  return allowed;
}

/**
 * Build the global "all Ruby method candidate names anywhere in Rails-land"
 * set, used to classify each extra as novel (nowhere in Rails) vs moved
 * (somewhere in Rails, just not in the matched file).
 *
 * Includes private/protected (internal) Ruby methods: a TS name mirroring a
 * Rails-private method that lives in a *different* `.rb` is "moved" (it exists
 * in Rails, just elsewhere), not "novel". Treating private mirrors as novel
 * would inflate the high-signal tier with methods Rails actually defines.
 *
 * File-level constants join the oracle on the same rule as methods: a Ruby
 * constant declared in a *different* `.rb` than the matched one scores as
 * `moved`, not `novel`. Rails does relocate constants (a shared error-code or
 * message constant reachable from several adapters), so the alternative —
 * leaving constants out of the oracle — would re-mint every constant that
 * doesn't sit in its own file as novel-by-omission, which is exactly the
 * miscount this pass exists to remove.
 */
export function buildGlobalRubyCandidates(ruby: ApiManifest): Set<string> {
  const all = new Set<string>();
  for (const pkg of Object.values(ruby.packages)) {
    for (const consts of Object.values(pkg.fileConstants ?? {})) {
      for (const name of Object.keys(consts)) {
        for (const c of rubyConstantCandidates(name)) all.add(c);
      }
    }
    const entities = [...Object.values(pkg.classes), ...Object.values(pkg.modules)] as ClassInfo[];
    for (const e of entities) {
      for (const m of [...e.instanceMethods, ...e.classMethods]) {
        const candidates = rubyMethodCandidates(m.name);
        if (!candidates) continue;
        for (const c of candidates) all.add(c);
      }
    }
  }
  return all;
}

/**
 * Flatten every package's extracted modules into one `FQN → ClassInfo` map so
 * `collectAllowedNames` can resolve a cross-package / railtie-injected mixin
 * (e.g. `GlobalID::Identification` from the globalid package included into
 * `ActiveRecord::Base`) that the per-package module map can't reach. Module
 * FQNs are globally unique across Rails-land, so a flat merge is safe; on the
 * rare collision last-writer-wins, which only affects the foreign-mixin
 * fallback path (the local package map still takes precedence).
 *
 * `pkgByFqn` records the owning package of each module so the unported-source
 * guard in `collectAllowedNames` can resolve `isSourceUnported` against the
 * package the module was extracted from (package-scoped unported patterns key
 * off the owner, not the host).
 */
export function buildCrossPackageModules(ruby: ApiManifest): {
  modules: Record<string, ClassInfo>;
  pkgByFqn: Record<string, string>;
} {
  const modules: Record<string, ClassInfo> = {};
  const pkgByFqn: Record<string, string> = {};
  for (const [pkgName, pkg] of Object.entries(ruby.packages)) {
    for (const [fqn, info] of Object.entries(pkg.modules) as [string, ClassInfo][]) {
      modules[fqn] = info;
      pkgByFqn[fqn] = pkgName;
    }
  }
  return { modules, pkgByFqn };
}

function buildPackageReport(
  pkg: string,
  ruby: ApiManifest,
  ts: ApiManifest,
  excludeGlobs: string[],
  globalRubyCandidates: Set<string>,
  crossPackageModules: Record<string, ClassInfo>,
  crossPackagePkgByFqn: Record<string, string>,
  novelOnly: boolean,
  allowKeys: Set<string>,
  matchedAllowKeys: Set<string>,
  tagKeys: Set<string>,
  matchedTagKeys: Set<string>,
): PackageTotals {
  const rubyPkg = ruby.packages[pkg];
  const tsPkg = ts.packages[pkg];
  const result: PackageTotals = {
    package: pkg,
    filesWithDrift: 0,
    totalExtras: 0,
    totalNovel: 0,
    totalMoved: 0,
    totalAllowlisted: 0,
    extraFiles: [],
  };
  if (!rubyPkg || !tsPkg) return result;

  // Pre-fold ASC's `::ClassMethods` submodules into their parent's
  // classMethods (mirrors compare.ts:759-773). Mutates rubyPkg.modules.
  const foldedFqns = foldClassMethodsModules(rubyPkg.modules as Record<string, ClassInfo>);

  const moduleFqnByShort = new Map<string, string[]>();
  for (const fqn of Object.keys(rubyPkg.modules)) {
    if (foldedFqns.has(fqn)) continue;
    const short = fqn.split("::").pop();
    if (!short) continue;
    const list = moduleFqnByShort.get(short) ?? [];
    list.push(fqn);
    moduleFqnByShort.set(short, list);
  }

  // Match compare.ts's nested-class filter: for each file, keep only the
  // shortest-named class as the "primary" and skip nested classes that
  // share the same file (e.g. `Preloader::Association::LoaderQuery` in
  // `preloader/association.rb` is an implementation detail — its methods
  // shouldn't inflate the parent file's allowed-name set).
  const primaryClassPerFile = new Map<string, string>();
  for (const [fqn, info] of Object.entries(rubyPkg.classes) as [string, ClassInfo][]) {
    if (!info.file) continue;
    const existing = primaryClassPerFile.get(info.file);
    if (!existing || fqn.split("::").length < existing.split("::").length) {
      primaryClassPerFile.set(info.file, fqn);
    }
  }

  const rubyFiles = new Map<string, RubyEntity[]>();
  for (const [fqn, info] of Object.entries(rubyPkg.classes) as [string, ClassInfo][]) {
    if (!info.file) continue;
    const primary = primaryClassPerFile.get(info.file);
    if (primary && primary !== fqn && fqn.startsWith(primary + "::")) continue;
    pushTo(rubyFiles, info.file, { fqn, info });
  }
  for (const [fqn, info] of Object.entries(rubyPkg.modules) as [string, ClassInfo][]) {
    if (!info.file) continue;
    if (foldedFqns.has(fqn)) continue;
    pushTo(rubyFiles, info.file, { fqn, info });
  }

  const tsClassesByFile = new Map<string, ClassInfo[]>();
  const tsModulesByFile = new Map<string, ClassInfo[]>();
  for (const c of Object.values(tsPkg.classes) as ClassInfo[]) {
    if (!c.file || c.reExportedFrom) continue;
    pushTo(tsClassesByFile, c.file, c);
  }
  for (const m of Object.values(tsPkg.modules) as ClassInfo[]) {
    if (!m.file || m.reExportedFrom) continue;
    pushTo(tsModulesByFile, m.file, m);
  }
  const tsFileFunctions = tsPkg.fileFunctions ?? {};

  for (const [rubyFile, entities] of rubyFiles) {
    const expectedTs = rubyFileToTs(rubyFile, pkg);
    if (excludeGlobs.some((g) => expectedTs.includes(g))) continue;

    const classes = tsClassesByFile.get(expectedTs) ?? [];
    const modules = tsModulesByFile.get(expectedTs) ?? [];
    const fileFns = tsFileFunctions[expectedTs];
    if (classes.length === 0 && modules.length === 0 && !fileFns) continue;

    const tsNames = collectTsFileNames(expectedTs, classes, modules, fileFns);
    if (tsNames.size === 0) continue;

    const allowed = collectAllowedNames(
      entities,
      pkg,
      rubyPkg.modules as Record<string, ClassInfo>,
      moduleFqnByShort,
      crossPackageModules,
      crossPackagePkgByFqn,
      Object.keys(rubyPkg.fileConstants?.[rubyFile] ?? {}),
    );

    const extras: ExtraName[] = [];
    let novelCount = 0;
    let movedCount = 0;
    let allowlistedCount = 0;
    for (const name of tsNames) {
      if (allowed.has(name)) continue;
      const allowKey = allowKeyOf({ package: pkg, tsFile: expectedTs, name });
      // Both sources are consulted during the migration window: record the
      // match on each that has it, so a doubly-justified name leaves neither
      // the JSON entry nor the tag looking stale.
      const jsonAllowed = allowKeys.has(allowKey);
      const tagAllowed = tagKeys.has(allowKey);
      if (jsonAllowed) matchedAllowKeys.add(allowKey);
      if (tagAllowed) matchedTagKeys.add(allowKey);
      if (jsonAllowed || tagAllowed) {
        allowlistedCount++;
        continue;
      }
      const kind: ExtraKind = globalRubyCandidates.has(name) ? "moved" : "novel";
      if (novelOnly && kind !== "novel") continue;
      extras.push({ name, kind });
      if (kind === "novel") novelCount++;
      else movedCount++;
    }
    result.totalAllowlisted += allowlistedCount;
    if (extras.length === 0) continue;

    // Sort novel before moved, then alphabetical — novel is the higher-signal
    // tier and surfaces first in per-file detail dumps.
    extras.sort((a, b) =>
      a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === "novel" ? -1 : 1,
    );
    result.extraFiles.push({
      package: pkg,
      tsFile: expectedTs,
      rubyFile,
      extraCount: extras.length,
      novelCount,
      movedCount,
      allowlistedCount,
      extras,
    });
    result.filesWithDrift++;
    result.totalExtras += extras.length;
    result.totalNovel += novelCount;
    result.totalMoved += movedCount;
  }

  // Rank order: novel-first when --novel-only is on (only novel exists),
  // and otherwise rank by novel count (high-signal) then total. Pure-moved
  // barrel files (588 extras, 0 novel) drop below smaller novel-heavy files.
  result.extraFiles.sort(
    (a, b) =>
      b.novelCount - a.novelCount ||
      b.extraCount - a.extraCount ||
      a.tsFile.localeCompare(b.tsFile),
  );
  return result;
}

interface Palette {
  red: string;
  yellow: string;
  dim: string;
  bold: string;
  reset: string;
}
const COLOR_ON: Palette = {
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  reset: "\x1b[0m",
};
const COLOR_OFF: Palette = { red: "", yellow: "", dim: "", bold: "", reset: "" };

function colorCount(n: number, p: Palette): string {
  if (n >= 20) return `${p.red}${p.bold}${n}${p.reset}`;
  if (n >= 10) return `${p.red}${n}${p.reset}`;
  if (n >= 5) return `${p.yellow}${n}${p.reset}`;
  return String(n);
}

/**
 * `useColor` defaults to TTY but is forceable via env so CI logs and pipes
 * don't get raw escape codes. Padding widens by the per-cell escape-sequence
 * length when color is on so the columns still align.
 */
function pickPalette(): { palette: Palette; colored: boolean } {
  const env = process.env["FORCE_COLOR"];
  if (env === "0" || env === "false") return { palette: COLOR_OFF, colored: false };
  if (env && env !== "") return { palette: COLOR_ON, colored: true };
  return process.stdout.isTTY === true
    ? { palette: COLOR_ON, colored: true }
    : { palette: COLOR_OFF, colored: false };
}

/**
 * Left-pad a colored numeric cell to a target visible width. `colorCount`
 * either returns plain `String(n)` (no color) or wraps it in ANSI escapes
 * that vary in length — small novel counts (<5) get no color and large
 * ones get red+bold+reset (13 invisible chars). Padding off the colored
 * string with a fixed boost misaligns the table for low-count rows.
 * Compute the gap from `String(n).length` so every row right-aligns.
 */
function padNumCell(n: number, colored: string, width: number): string {
  const visible = String(n).length;
  const gap = Math.max(0, width - visible);
  return " ".repeat(gap) + colored;
}

function printHumanReport(report: Report, topN: number, maxDetail: number): void {
  const { palette: p } = pickPalette();

  console.log(`\n${p.bold}Extra TS surface vs Rails${p.reset}  (the inverse of api:compare)`);
  console.log(
    `${p.dim}Generated ${report.generatedAt}  |  novel = name not found anywhere in Rails;  moved = found, just in a different .rb${p.reset}\n`,
  );

  console.log(`${p.bold}Per-package totals${p.reset}`);
  console.log(
    `  ${"Package".padEnd(20)} ${"Files".padStart(7)} ${"Novel".padStart(7)} ${"Moved".padStart(7)} ${"Total".padStart(7)} ${"Allowed".padStart(7)}`,
  );
  console.log(
    `  ${"-".repeat(20)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)}`,
  );
  for (const pkg of report.packages) {
    const novel = padNumCell(pkg.totalNovel, colorCount(pkg.totalNovel, p), 7);
    console.log(
      `  ${pkg.package.padEnd(20)} ${String(pkg.filesWithDrift).padStart(7)} ${novel} ${String(pkg.totalMoved).padStart(7)} ${String(pkg.totalExtras).padStart(7)} ${String(pkg.totalAllowlisted).padStart(7)}`,
    );
  }
  console.log(
    `\n${p.dim}Allowlist (extra-surface-allow.json): ${report.allowlist.total} entr(ies), ` +
      `${report.allowlist.matched} matched — allowed extras are subtracted from the counts above.${p.reset}`,
  );
  console.log(
    `${p.dim}@noRailsEquivalent tags: ${report.tagged.total} tag(s), ` +
      `${report.tagged.matched} matched — counted in Allowed alongside the allowlist.${p.reset}`,
  );

  console.log(
    `\n${p.bold}Top ${Math.min(topN, report.topN.length)} most-divergent files${p.reset}  ${p.dim}(ranked by novel count, then total)${p.reset}`,
  );
  console.log(
    `  ${"#".padStart(3)}  ${"Novel".padStart(5)}  ${"Moved".padStart(5)}  ${"Package".padEnd(16)} ${"TS file".padEnd(60)}`,
  );
  console.log(
    `  ${"-".repeat(3)}  ${"-".repeat(5)}  ${"-".repeat(5)}  ${"-".repeat(16)} ${"-".repeat(60)}`,
  );
  for (let i = 0; i < Math.min(topN, report.topN.length); i++) {
    const f = report.topN[i];
    const c = padNumCell(f.novelCount, colorCount(f.novelCount, p), 5);
    console.log(
      `  ${String(i + 1).padStart(3)}  ${c}  ${String(f.movedCount).padStart(5)}  ${f.package.padEnd(16)} ${f.tsFile.padEnd(60)}`,
    );
  }

  console.log(
    `\n${p.bold}Per-file detail${p.reset}  ${p.dim}(novel-first; moved names dimmed; +N more elided when over --max-detail)${p.reset}\n`,
  );
  for (const pkg of report.packages) {
    if (pkg.extraFiles.length === 0) continue;
    console.log(`${p.bold}${pkg.package}${p.reset}`);
    for (const f of pkg.extraFiles) {
      console.log(`  ${f.tsFile} — ${colorCount(f.novelCount, p)} novel, ${f.movedCount} moved`);
      const shown = maxDetail > 0 ? f.extras.slice(0, maxDetail) : f.extras;
      const cols = 4;
      for (let i = 0; i < shown.length; i += cols) {
        const row = shown.slice(i, i + cols).map((e) => {
          const label = e.name.padEnd(24);
          return e.kind === "moved" ? `${p.dim}${label}${p.reset}` : label;
        });
        console.log(`    ${row.join(" ")}`);
      }
      const elided = f.extras.length - shown.length;
      if (elided > 0) console.log(`    ${p.dim}… +${elided} more${p.reset}`);
    }
    console.log();
  }
}

export function buildReport(
  ruby: ApiManifest,
  ts: ApiManifest,
  opts: {
    filterPkg: string | null;
    excludeGlobs: string[];
    novelOnly: boolean;
    topN: number;
    allow?: AllowEntry[];
  },
): Report {
  const allow = opts.allow ?? [];
  const allowKeys = new Set(allow.map(allowKeyOf));
  const matchedAllowKeys = new Set<string>();
  const tagged = collectTaggedEntries(ts);
  const tagKeys = new Set(tagged.map(allowKeyOf));
  const matchedTagKeys = new Set<string>();
  const globalRubyCandidates = buildGlobalRubyCandidates(ruby);
  const { modules: crossPackageModules, pkgByFqn: crossPackagePkgByFqn } =
    buildCrossPackageModules(ruby);

  const packages: PackageTotals[] = [];
  const scannedPkgs = new Set<string>();
  for (const pkg of Object.keys(ruby.packages)) {
    if (opts.filterPkg && pkg !== opts.filterPkg) continue;
    if (!ts.packages[pkg]) continue;
    scannedPkgs.add(pkg);
    packages.push(
      buildPackageReport(
        pkg,
        ruby,
        ts,
        opts.excludeGlobs,
        globalRubyCandidates,
        crossPackageModules,
        crossPackagePkgByFqn,
        opts.novelOnly,
        allowKeys,
        matchedAllowKeys,
        tagKeys,
        matchedTagKeys,
      ),
    );
  }
  packages.sort((a, b) => b.totalNovel - a.totalNovel || b.totalExtras - a.totalExtras);

  const allExtras: ExtraFile[] = packages.flatMap((p) => p.extraFiles);
  allExtras.sort(
    (a, b) =>
      b.novelCount - a.novelCount ||
      b.extraCount - a.extraCount ||
      a.tsFile.localeCompare(b.tsFile),
  );

  const stale = allow.filter(
    (e) => scannedPkgs.has(e.package) && !matchedAllowKeys.has(allowKeyOf(e)),
  );
  const staleTagged = tagged.filter(
    (e) => scannedPkgs.has(e.package) && !matchedTagKeys.has(allowKeyOf(e)),
  );

  return {
    generatedAt: new Date().toISOString(),
    packages,
    topN: allExtras.slice(0, opts.topN),
    allowlist: { total: allow.length, matched: matchedAllowKeys.size, stale },
    tagged: { total: tagged.length, matched: matchedTagKeys.size, stale: staleTagged },
  };
}

export async function resolveAllowlist(
  file: string = ALLOWLIST_PATH,
): Promise<{ allow: AllowEntry[]; problems: string[] }> {
  let allow: AllowEntry[];
  try {
    allow = await loadAllowlist(file);
  } catch (e) {
    return { allow: [], problems: [e instanceof Error ? e.message : String(e)] };
  }
  const problems = findInvalidAllowEntries(allow);
  return problems.length > 0 ? { allow: [], problems } : { allow, problems };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  const rubyPath = path.join(OUTPUT_DIR, "rails-api.json");
  const tsPath = path.join(OUTPUT_DIR, "ts-api.json");
  if (!fs.existsSync(rubyPath) || !fs.existsSync(tsPath)) {
    console.error(
      `Missing ${path.basename(fs.existsSync(rubyPath) ? tsPath : rubyPath)}. Run \`pnpm api:compare\` first to generate the manifests.`,
    );
    process.exit(1);
  }
  const ruby: ApiManifest = JSON.parse(fs.readFileSync(rubyPath, "utf-8"));
  const ts: ApiManifest = JSON.parse(fs.readFileSync(tsPath, "utf-8"));

  // An unreadable or malformed allowlist must NOT stop the report: these
  // outputs feed the stats pipeline. Degrade to no suppressions, print
  // everything, and only then set the exit code.
  const { allow, problems } = await resolveAllowlist();

  const report = buildReport(ruby, ts, {
    filterPkg: args.filterPkg,
    excludeGlobs: args.excludeGlobs,
    novelOnly: args.novelOnly,
    topN: args.topN,
    allow,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report, args.topN, args.maxDetail);
  }

  if (problems.length > 0) {
    console.error(
      `\nextra-surface allowlist: ${problems.length} problem(s) with ` +
        `${path.basename(ALLOWLIST_PATH)} — the report above was produced with NO ` +
        "suppressions:\n" +
        problems.map((m) => `  ${m}`).join("\n") +
        "\nEvery entry needs a unique package+tsFile+name and a non-empty reason.\n",
    );
    process.exit(1);
  }

  // Stale entries can't be judged when --exclude-glob hides whole TS files.
  if (args.excludeGlobs.length > 0) return;
  const { stale } = report.allowlist;
  const staleTagged = report.tagged.stale;
  if (staleTagged.length > 0) {
    console.error(
      `\nextra-surface: ${staleTagged.length} STALE @noRailsEquivalent tag(s) on ` +
        "methods that no longer flag as extra surface — Rails gained the method, " +
        "the file mapping changed, the declaration is internal or `_`-prefixed " +
        "(never counted), or the tag covers a moved (misplaced) port that belongs " +
        "in its Rails-layout file. Delete the tag next to the code:\n" +
        staleTagged.map((e) => `  - ${e.package}  ${e.tsFile}  ${e.name}`).join("\n") +
        "\n",
    );
  }
  if (stale.length === 0) {
    if (staleTagged.length > 0) process.exit(1);
    return;
  }
  console.error(
    `\nextra-surface allowlist: ${stale.length} STALE entr(ies) that no longer ` +
      "flag as extra surface. The allowlist only shrinks — remove them from " +
      `${path.basename(ALLOWLIST_PATH)}:\n` +
      stale.map((e) => `  - ${e.package}  ${e.tsFile}  ${e.name}`).join("\n") +
      "\n",
  );
  process.exit(1);
}

const invokedAsScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("extra-surface.ts");
if (invokedAsScript) void main();
