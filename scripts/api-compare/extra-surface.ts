#!/usr/bin/env npx tsx
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
 *      `fileFunctions`. Filter out `internal: true` (covers `_`-prefixed,
 *      `@internal` JSDoc, `private`/`protected`, `#`-prefixed fields).
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
 * Flags:
 *   --package <name>      Restrict to one package (e.g. activerecord).
 *   --top <N>             Top-N most-divergent files (default 50).
 *   --json                Emit machine-readable JSON to stdout instead of
 *                         the human report.
 *   --exclude-glob <g>    Skip TS files matching <g> (substring match
 *                         against the TS file path). Repeatable. Useful
 *                         for known-intentional extensions like
 *                         `dx-tests/` or `defineSchema`-only modules.
 *   --help                Print this message.
 */

import * as fs from "fs";
import * as path from "path";
import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";
import { OUTPUT_DIR } from "./config.js";
import { rubyFileToTs, rubyMethodToTs } from "./conventions.js";

interface ExtraFile {
  package: string;
  tsFile: string;
  rubyFile: string;
  extraCount: number;
  extras: string[];
}

interface PackageTotals {
  package: string;
  filesWithDrift: number;
  totalExtras: number;
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
  --help               This message

Requires: pnpm api:compare must have run first to produce
  scripts/api-compare/output/{rails-api.json,ts-api.json}.
`;

interface CliArgs {
  filterPkg: string | null;
  topN: number;
  json: boolean;
  excludeGlobs: string[];
}

export function parseArgs(argv: string[]): CliArgs {
  let filterPkg: string | null = null;
  let topN = 50;
  let json = false;
  const excludeGlobs: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      console.log(HELP);
      process.exit(0);
    } else if (a === "--package") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) {
        console.error("--package requires a value");
        process.exit(1);
      }
      filterPkg = v;
    } else if (a === "--top") {
      const v = argv[++i];
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        console.error("--top requires a positive integer");
        process.exit(1);
      }
      topN = Math.floor(n);
    } else if (a === "--json") {
      json = true;
    } else if (a === "--exclude-glob") {
      const v = argv[++i];
      if (!v || v.startsWith("--")) {
        console.error("--exclude-glob requires a value");
        process.exit(1);
      }
      excludeGlobs.push(v);
    } else {
      console.error(`Unknown flag: ${a}`);
      console.error(HELP);
      process.exit(1);
    }
  }
  return { filterPkg, topN, json, excludeGlobs };
}

/**
 * Collect public TS names declared *in this file's own entities* — no
 * inherited surface. Inherited names that the parent already defines are
 * not "drift" relative to Rails; they're the parent's problem (and Rails
 * inherits them too).
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
 * For a set of Ruby entities (one Ruby file), compute the union of all TS
 * candidate names produced by `rubyMethodToTs`. Walks `include`s and
 * `extend`s shallowly so methods reached via mixin still count as expected.
 *
 * Cross-package or stdlib mixins are silently skipped — same convention
 * as compare.ts's `flattenIncludedMethodInfos`.
 */
function collectAllowedNames(
  entities: ClassInfo[],
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

  const walkMixin = (name: string): void => {
    const fqns = name.includes("::") ? [name] : (moduleFqnByShort.get(name) ?? []);
    for (const fqn of fqns) {
      if (visited.has(fqn)) continue;
      visited.add(fqn);
      const mod = rubyModules[fqn];
      if (!mod) continue;
      addMethods(mod.instanceMethods);
      addMethods(mod.classMethods);
      for (const inc of mod.includes ?? []) walkMixin(inc);
      for (const ext of mod.extends ?? []) walkMixin(ext);
    }
  };

  for (const e of entities) {
    addMethods(e.instanceMethods);
    addMethods(e.classMethods);
    for (const inc of e.includes ?? []) walkMixin(inc);
    for (const ext of e.extends ?? []) walkMixin(ext);
  }
  return allowed;
}

function buildPackageReport(
  pkg: string,
  ruby: ApiManifest,
  ts: ApiManifest,
  excludeGlobs: string[],
): PackageTotals {
  const rubyPkg = ruby.packages[pkg];
  const tsPkg = ts.packages[pkg];
  const result: PackageTotals = {
    package: pkg,
    filesWithDrift: 0,
    totalExtras: 0,
    extraFiles: [],
  };
  if (!rubyPkg || !tsPkg) return result;

  const moduleFqnByShort = new Map<string, string[]>();
  for (const fqn of Object.keys(rubyPkg.modules)) {
    const short = fqn.split("::").pop();
    if (!short) continue;
    const list = moduleFqnByShort.get(short) ?? [];
    list.push(fqn);
    moduleFqnByShort.set(short, list);
  }

  const rubyFiles = new Map<string, ClassInfo[]>();
  for (const entity of [
    ...Object.values(rubyPkg.classes),
    ...Object.values(rubyPkg.modules),
  ] as ClassInfo[]) {
    if (!entity.file) continue;
    const list = rubyFiles.get(entity.file) ?? [];
    list.push(entity);
    rubyFiles.set(entity.file, list);
  }

  const tsClassesByFile = new Map<string, ClassInfo[]>();
  const tsModulesByFile = new Map<string, ClassInfo[]>();
  for (const c of Object.values(tsPkg.classes) as ClassInfo[]) {
    if (!c.file) continue;
    (tsClassesByFile.get(c.file) ?? tsClassesByFile.set(c.file, []).get(c.file)!).push(c);
  }
  for (const m of Object.values(tsPkg.modules) as ClassInfo[]) {
    if (!m.file) continue;
    (tsModulesByFile.get(m.file) ?? tsModulesByFile.set(m.file, []).get(m.file)!).push(m);
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

    const extras: string[] = [];
    for (const name of tsNames) {
      if (!allowed.has(name)) extras.push(name);
    }
    if (extras.length === 0) continue;

    extras.sort();
    result.extraFiles.push({
      package: pkg,
      tsFile: expectedTs,
      rubyFile,
      extraCount: extras.length,
      extras,
    });
    result.filesWithDrift++;
    result.totalExtras += extras.length;
  }

  result.extraFiles.sort((a, b) => b.extraCount - a.extraCount || a.tsFile.localeCompare(b.tsFile));
  return result;
}

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function colorCount(n: number, useColor: boolean): string {
  if (!useColor) return String(n);
  if (n >= 20) return `${RED}${BOLD}${n}${RESET}`;
  if (n >= 10) return `${RED}${n}${RESET}`;
  if (n >= 5) return `${YELLOW}${n}${RESET}`;
  return String(n);
}

function printHumanReport(report: Report, topN: number): void {
  const useColor = process.stdout.isTTY === true;

  console.log(`\n${BOLD}Extra TS surface vs Rails${RESET}  (the inverse of api:compare)`);
  console.log(`${DIM}Generated ${report.generatedAt}${RESET}\n`);

  console.log(`${BOLD}Per-package totals${RESET}`);
  console.log(
    `  ${"Package".padEnd(20)} ${"Files w/ drift".padStart(15)} ${"Extra names".padStart(13)}`,
  );
  console.log(`  ${"-".repeat(20)} ${"-".repeat(15)} ${"-".repeat(13)}`);
  for (const pkg of report.packages) {
    console.log(
      `  ${pkg.package.padEnd(20)} ${String(pkg.filesWithDrift).padStart(15)} ${colorCount(pkg.totalExtras, useColor).padStart(useColor ? 22 : 13)}`,
    );
  }

  console.log(`\n${BOLD}Top ${Math.min(topN, report.topN.length)} most-divergent files${RESET}`);
  console.log(
    `  ${"#".padStart(3)}  ${"Extra".padStart(5)}  ${"Package".padEnd(16)} ${"TS file".padEnd(60)}`,
  );
  console.log(`  ${"-".repeat(3)}  ${"-".repeat(5)}  ${"-".repeat(16)} ${"-".repeat(60)}`);
  for (let i = 0; i < Math.min(topN, report.topN.length); i++) {
    const f = report.topN[i];
    const c = colorCount(f.extraCount, useColor);
    console.log(
      `  ${String(i + 1).padStart(3)}  ${c.padStart(useColor ? 14 : 5)}  ${f.package.padEnd(16)} ${f.tsFile.padEnd(60)}`,
    );
  }

  console.log(
    `\n${BOLD}Per-file detail${RESET} (only files with drift; sorted by extra count desc)\n`,
  );
  for (const pkg of report.packages) {
    if (pkg.extraFiles.length === 0) continue;
    console.log(`${BOLD}${pkg.package}${RESET}`);
    for (const f of pkg.extraFiles) {
      console.log(`  ${f.tsFile} — +${f.extraCount} over Rails`);
      const cols = 4;
      for (let i = 0; i < f.extras.length; i += cols) {
        const row = f.extras.slice(i, i + cols).map((n) => n.padEnd(24));
        console.log(`    ${row.join(" ")}`);
      }
    }
    console.log();
  }
}

export function main(argv = process.argv.slice(2)): void {
  const { filterPkg, topN, json, excludeGlobs } = parseArgs(argv);

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

  const packages: PackageTotals[] = [];
  for (const pkg of Object.keys(ruby.packages)) {
    if (filterPkg && pkg !== filterPkg) continue;
    if (!ts.packages[pkg]) continue;
    packages.push(buildPackageReport(pkg, ruby, ts, excludeGlobs));
  }
  packages.sort((a, b) => b.totalExtras - a.totalExtras);

  const allExtras: ExtraFile[] = packages.flatMap((p) => p.extraFiles);
  allExtras.sort((a, b) => b.extraCount - a.extraCount || a.tsFile.localeCompare(b.tsFile));

  const report: Report = {
    generatedAt: new Date().toISOString(),
    packages,
    topN: allExtras.slice(0, topN),
  };

  if (json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  printHumanReport(report, topN);
}

const invokedAsScript =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  typeof process.argv[1] === "string" &&
  process.argv[1].endsWith("extra-surface.ts");
if (invokedAsScript) main();
