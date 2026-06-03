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
 *   2. Collect Ruby public methods declared in (or `include`d into) the
 *      entities in that Ruby file. Map each to its TS-candidate name set
 *      via `rubyMethodToTs`. Union = the "allowed" TS name set.
 *   3. Collect public TS names declared in the matching TS file — each
 *      class/module's *own* methods (skipping inherited surface so the
 *      diff measures this file's drift, not its ancestor's) plus top-level
 *      `fileFunctions`. Filter out `internal: true` (Ruby private/protected,
 *      TS private/protected, TS `#`-prefixed fields, `@internal` JSDoc) and
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
import * as path from "path";
import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";
import { OUTPUT_DIR } from "./config.js";
import { rubyFileToTs, rubyMethodToTs } from "./conventions.js";
import { resolveModuleName } from "./compare.js";

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
 * TS-side method names that mirror Ruby methods on `conventions.SKIP`.
 * `rubyMethodToTs` returns null for SKIP entries (they have no clean TS
 * mapping at scoring time), so they never enter `allowed` even when the
 * Ruby method exists in the matched file — but a TS override of e.g.
 * `freeze`/`inspect` IS Rails-faithful (Rails AR `Base#freeze` lives in
 * core.rb, AM `model#inspect` in attribute_methods.rb). Filtering these
 * from the TS-side name set prevents them from showing up as "novel
 * drift" when in fact they're carrying-the-pattern through.
 */
const TS_ALWAYS_ALLOWED = new Set([
  "dup",
  "clone",
  "freeze",
  "inspect",
  "prettyPrint",
  "tap",
  "then",
  "eql",
  "equals",
  "initializeDup",
  "initializeClone",
  "initializeCopy",
  "encodeWith",
  "initWith",
  "toArray",
  "toH",
  "toHash",
  "valueOf",
  "klasses",
  // Node.js / V8 inspection hook — the canonical TS analog of Ruby
  // `inspect`. Pure language-level convention; never has a Rails counterpart.
  '[Symbol.for("nodejs.util.inspect.custom")]',
]);

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
  extras: ExtraName[];
}

interface PackageTotals {
  package: string;
  filesWithDrift: number;
  totalExtras: number;
  totalNovel: number;
  totalMoved: number;
  extraFiles: ExtraFile[];
}

interface Report {
  generatedAt: string;
  packages: PackageTotals[];
  topN: ExtraFile[];
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
 * and `@internal` JSDoc set `internal: true`). The Rails-private
 * convention in this repo means we filter `_`-prefix here too.
 */
function collectTsFileNames(
  file: string,
  classes: ClassInfo[],
  modules: ClassInfo[],
  fileFunctions: MethodInfo[] | undefined,
): Set<string> {
  const out = new Set<string>();
  const push = (m: MethodInfo): void => {
    if (m.internal === true) return;
    if (m.name.startsWith("_")) return;
    if (TS_ALWAYS_ALLOWED.has(m.name)) return;
    out.add(m.name);
  };
  for (const c of classes) {
    if (c.file !== file) continue;
    for (const m of c.instanceMethods) push(m);
    for (const m of c.classMethods) push(m);
  }
  for (const m of modules) {
    if (m.file !== file) continue;
    for (const im of m.instanceMethods) push(im);
    for (const cm of m.classMethods) push(cm);
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
  rubyModules: Record<string, ClassInfo>,
  moduleFqnByShort: Map<string, string[]>,
): Set<string> {
  const allowed = new Set<string>();
  const visited = new Set<string>();

  const addMethods = (methods: MethodInfo[]): void => {
    for (const m of methods) {
      if (m.internal === true) continue;
      const candidates = rubyMethodToTs(m.name);
      if (!candidates) continue;
      for (const c of candidates) allowed.add(c);
    }
  };

  const walkMixin = (incName: string, contextFqn: string): void => {
    const fqns = resolveModuleName(incName, contextFqn, moduleFqnByShort);
    for (const fqn of fqns) {
      if (visited.has(fqn)) continue;
      visited.add(fqn);
      const mod = rubyModules[fqn];
      if (!mod) continue;
      // Only the module's instance methods cross into the host. Class
      // methods on the module itself stay on the module (Ruby `include`
      // semantics; matches compare.flattenIncludedMethodInfos).
      addMethods(mod.instanceMethods);
      // Chain `include`s only — a module's own `extend` doesn't propagate
      // (Ruby singleton-class semantics).
      for (const inc of mod.includes ?? []) walkMixin(inc, fqn);
    }
  };

  for (const { fqn, info } of entities) {
    addMethods(info.instanceMethods);
    addMethods(info.classMethods);
    for (const inc of info.includes ?? []) walkMixin(inc, fqn);
    for (const ext of info.extends ?? []) walkMixin(ext, fqn);
  }
  return allowed;
}

/**
 * Build the global "all Ruby method candidate names anywhere in Rails-land"
 * set, used to classify each extra as novel (nowhere in Rails) vs moved
 * (somewhere in Rails, just not in the matched file).
 */
export function buildGlobalRubyCandidates(ruby: ApiManifest): Set<string> {
  const all = new Set<string>();
  for (const pkg of Object.values(ruby.packages)) {
    const entities = [...Object.values(pkg.classes), ...Object.values(pkg.modules)] as ClassInfo[];
    for (const e of entities) {
      for (const m of [...e.instanceMethods, ...e.classMethods]) {
        if (m.internal === true) continue;
        const candidates = rubyMethodToTs(m.name);
        if (!candidates) continue;
        for (const c of candidates) all.add(c);
      }
    }
  }
  return all;
}

function buildPackageReport(
  pkg: string,
  ruby: ApiManifest,
  ts: ApiManifest,
  excludeGlobs: string[],
  globalRubyCandidates: Set<string>,
  novelOnly: boolean,
): PackageTotals {
  const rubyPkg = ruby.packages[pkg];
  const tsPkg = ts.packages[pkg];
  const result: PackageTotals = {
    package: pkg,
    filesWithDrift: 0,
    totalExtras: 0,
    totalNovel: 0,
    totalMoved: 0,
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
    if (!c.file) continue;
    pushTo(tsClassesByFile, c.file, c);
  }
  for (const m of Object.values(tsPkg.modules) as ClassInfo[]) {
    if (!m.file) continue;
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
      rubyPkg.modules as Record<string, ClassInfo>,
      moduleFqnByShort,
    );

    const extras: ExtraName[] = [];
    let novelCount = 0;
    let movedCount = 0;
    for (const name of tsNames) {
      if (allowed.has(name)) continue;
      const kind: ExtraKind = globalRubyCandidates.has(name) ? "moved" : "novel";
      if (novelOnly && kind !== "novel") continue;
      extras.push({ name, kind });
      if (kind === "novel") novelCount++;
      else movedCount++;
    }
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
    `  ${"Package".padEnd(20)} ${"Files".padStart(7)} ${"Novel".padStart(7)} ${"Moved".padStart(7)} ${"Total".padStart(7)}`,
  );
  console.log(
    `  ${"-".repeat(20)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)} ${"-".repeat(7)}`,
  );
  for (const pkg of report.packages) {
    const novel = padNumCell(pkg.totalNovel, colorCount(pkg.totalNovel, p), 7);
    console.log(
      `  ${pkg.package.padEnd(20)} ${String(pkg.filesWithDrift).padStart(7)} ${novel} ${String(pkg.totalMoved).padStart(7)} ${String(pkg.totalExtras).padStart(7)}`,
    );
  }

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
  },
): Report {
  const globalRubyCandidates = buildGlobalRubyCandidates(ruby);

  const packages: PackageTotals[] = [];
  for (const pkg of Object.keys(ruby.packages)) {
    if (opts.filterPkg && pkg !== opts.filterPkg) continue;
    if (!ts.packages[pkg]) continue;
    packages.push(
      buildPackageReport(pkg, ruby, ts, opts.excludeGlobs, globalRubyCandidates, opts.novelOnly),
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

  return {
    generatedAt: new Date().toISOString(),
    packages,
    topN: allExtras.slice(0, opts.topN),
  };
}

export function main(argv = process.argv.slice(2)): void {
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

  const report = buildReport(ruby, ts, {
    filterPkg: args.filterPkg,
    excludeGlobs: args.excludeGlobs,
    novelOnly: args.novelOnly,
    topN: args.topN,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printHumanReport(report, args.topN, args.maxDetail);
}

const invokedAsScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("extra-surface.ts");
if (invokedAsScript) main();
