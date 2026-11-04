#!/usr/bin/env -S npx tsx
/**
 * `parity:api:privates` — the privates lane of extra surface (RFC 0218).
 *
 * `parity:api:extra` scores only public TS names; every internal declaration
 * is dropped before scoring (`extra-surface.ts`, `walkTsFileSurface`). This
 * report scores those declarations against the Ruby private/protected methods
 * of the mirrored `.rb`, through the same Ruby-side walk
 * (`collectAllowedNames` with `visibility: "private"`).
 *
 * Population, per Rails-matched or uncovered TS file:
 *   - `modifier`   a TS `private` / `protected` member, or a `#` member (the
 *                  extractor reports one as `visibility: "private"`);
 *   - `internal`   an `@internal` member or exported function;
 *   - `fileLocal`  a module-private helper (`extractFileLocalHelpers`);
 *   - `underscore` any `_`-prefixed name, whatever its visibility.
 * `declaredIn` members, synthesized mixins, interface members and a bodyless
 * `aliasOf` helper (scored through its target) are held out.
 *
 * Columns: `credited` (a Ruby private/protected method of the mirrored `.rb`
 * matches), `visibility` (only a Ruby public method of it matches), `moved` (a
 * Ruby method in another `.rb` matches), `novel`, and `allowed` (a classified
 * `@noRailsEquivalent` receipt covers a non-credited name; one on a credited
 * name is STALE). `perf` counts the `novel` + `moved` rows carrying `@perf`.
 */
import * as fsp from "fs/promises";
import * as path from "path";
import type { ApiManifest, ClassInfo, MethodInfo } from "@blazetrails/parity/types";
import { rubyFileToTs } from "@blazetrails/parity/conventions";
import { OUTPUT_DIR, TS_ONLY_PACKAGES } from "./config.js";
import {
  allowKeyOf,
  buildCrossPackageModules,
  classifyReason,
  collectTaggedEntries,
  buildGlobalRubyCandidates,
  collectAllowedNames,
  indexRubyFiles,
  uncoveredTsFiles,
  type RubyOwner,
  type TaggedEntry,
} from "./extra-surface.js";

export type PopulationKind = "modifier" | "internal" | "fileLocal" | "underscore";
export type PrivateKind = "credited" | "visibility" | "moved" | "novel" | "allowed";

export interface PopulationName {
  name: string;
  population: PopulationKind;
  perf?: true;
}

export interface PrivateName extends PopulationName {
  package: string;
  tsFile: string;
  rubyFile: string | null;
  kind: PrivateKind;
  receipted?: true;
}

export interface PrivatesTotals {
  package: string;
  population: number;
  credited: number;
  visibility: number;
  moved: number;
  novel: number;
  allowed: number;
  /** `novel` + `moved` rows carrying `@perf`; a sub-count, never subtracted. */
  perf: number;
}

export interface PrivatesReport {
  packages: PrivatesTotals[];
  names: PrivateName[];
  /** Receipts on a name this lane credits: nothing for them to cover. */
  stale: TaggedEntry[];
}

const HELP = `Usage: pnpm parity:api:privates [--package <name>] [--json]

Scores every internal TS declaration (private / protected / #, @internal,
file-local helpers, _-prefixed names) against the Ruby private/protected
methods of the mirrored .rb file:
  credited    a Ruby private/protected method of the mirrored .rb matches
  visibility  only a Ruby PUBLIC method of the mirrored .rb matches
  moved       a Ruby method elsewhere in the gem matches
  novel       nothing matches
  allowed     a @noRailsEquivalent PERMANENT|CONVERGEABLE receipt covers it
  perf        the novel + moved rows carrying @perf (a sub-count)
A _ name is matched with its leading _ stripped once. Exits non-zero only for a
missing manifest or a STALE receipt (one on a credited name).`;

function memberPopulation(m: MethodInfo): PopulationKind | null {
  if (m.name.startsWith("_")) return "underscore";
  if (m.visibility !== "public") return "modifier";
  if (m.internal === true) return "internal";
  return null;
}

/** The privates population a TS file declares, deduplicated by name. */
export function collectPrivatesPopulation(
  file: string,
  classes: ClassInfo[],
  modules: ClassInfo[],
  fileFunctions: MethodInfo[] | undefined,
  internalConstants: string[] = [],
  fileConstants: string[] = [],
): PopulationName[] {
  const out = new Map<string, PopulationName>();
  const add = (name: string, population: PopulationKind | null, perf?: boolean): void => {
    if (population === null || name === "constructor" || out.has(name)) return;
    out.set(name, { name, population, ...(perf === true ? { perf: true as const } : {}) });
  };
  for (const c of [...classes, ...modules]) {
    if (c.file !== file || c.synthesizedMixin === true) continue;
    if (c.isInterface === true && c.declaredAsNamespace !== true) continue;
    for (const m of [...c.instanceMethods, ...c.classMethods]) {
      if (m.declaredIn !== undefined) continue;
      add(m.name, memberPopulation(m), m.perf);
    }
  }
  for (const fn of fileFunctions ?? []) {
    if (fn.reExportedFrom !== undefined || fn.aliasOf !== undefined) continue;
    if (fn.name.startsWith("_")) add(fn.name, "underscore", fn.perf);
    else if (fn.visibility === "private") add(fn.name, "fileLocal", fn.perf);
    else if (fn.internal === true) add(fn.name, "internal", fn.perf);
  }
  for (const name of internalConstants) add(name, name.startsWith("_") ? "underscore" : "internal");
  for (const name of fileConstants) if (name.startsWith("_")) add(name, "underscore");
  return [...out.values()];
}

function matchNames(name: string): string[] {
  return name.startsWith("_") ? [name, name.slice(1)] : [name];
}

export function buildPrivatesReport(
  ruby: ApiManifest,
  ts: ApiManifest,
  opts: { filterPkg: string | null },
): PrivatesReport {
  const global = buildGlobalRubyCandidates(ruby, Infinity);
  const cross = buildCrossPackageModules(ruby);
  const receipts = new Map<string, TaggedEntry>();
  for (const e of collectTaggedEntries(ts)) {
    if (e.inherited !== true && e.fileLevel !== true && classifyReason(e.reason) !== "unclassified")
      receipts.set(allowKeyOf(e), e);
  }
  const packages: PrivatesTotals[] = [];
  const names: PrivateName[] = [];
  const stale: TaggedEntry[] = [];
  for (const pkg of [...Object.keys(ruby.packages), ...TS_ONLY_PACKAGES]) {
    const rubyPkgSource = ruby.packages[pkg] ?? { classes: {}, modules: {} };
    if (opts.filterPkg !== null && pkg !== opts.filterPkg) continue;
    const tsPkg = ts.packages[pkg];
    if (!tsPkg) continue;
    const rubyPkg = structuredClone(rubyPkgSource);
    const { moduleFqnByShort, rubyFiles, rubyFileNames, coveredTsFiles } = indexRubyFiles(
      pkg,
      rubyPkg,
    );
    const byFile = (entries: ClassInfo[]): Map<string, ClassInfo[]> => {
      const map = new Map<string, ClassInfo[]>();
      for (const c of entries) {
        if (!c.file || c.reExportedFrom) continue;
        map.set(c.file, [...(map.get(c.file) ?? []), c]);
      }
      return map;
    };
    const tsClassesByFile = byFile(Object.values(tsPkg.classes));
    const tsModulesByFile = byFile(Object.values(tsPkg.modules));
    const tsFileFunctions = tsPkg.fileFunctions ?? {};
    const tsFileConstants = tsPkg.fileConstants ?? {};
    const tsInternalConstants = tsPkg.fileInternalConstants ?? {};
    const totals: PrivatesTotals = {
      package: pkg,
      population: 0,
      credited: 0,
      visibility: 0,
      moved: 0,
      novel: 0,
      allowed: 0,
      perf: 0,
    };
    const targets: { tsFile: string; rubyFile: string | null }[] = [
      ...[...rubyFileNames].sort().map((rubyFile) => ({
        tsFile: rubyFileToTs(rubyFile, pkg),
        rubyFile,
      })),
      ...uncoveredTsFiles(
        coveredTsFiles,
        tsClassesByFile,
        tsModulesByFile,
        tsFileFunctions,
        tsFileConstants,
      ).map((tsFile) => ({ tsFile, rubyFile: null })),
    ];
    for (const { tsFile, rubyFile } of targets) {
      const population = collectPrivatesPopulation(
        tsFile,
        tsClassesByFile.get(tsFile) ?? [],
        tsModulesByFile.get(tsFile) ?? [],
        tsFileFunctions[tsFile],
        tsInternalConstants[tsFile],
        Object.keys(tsFileConstants[tsFile] ?? {}),
      );
      if (population.length === 0) continue;
      const mirrored = (visibility: "private" | "public"): Set<string> =>
        rubyFile === null
          ? new Set<string>()
          : collectAllowedNames(
              rubyFiles.get(rubyFile) ?? [],
              pkg,
              rubyPkg.modules,
              moduleFqnByShort,
              cross.modules,
              cross.pkgByFqn,
              cross.classes,
              cross.constantAliases,
              [],
              rubyFile,
              [],
              undefined,
              visibility,
            );
      const allowed = mirrored("private");
      const publicOnly = mirrored("public");
      const elsewhere = (owner: RubyOwner): boolean =>
        owner.package !== pkg || owner.file !== rubyFile;
      for (const p of population) {
        const candidates = matchNames(p.name);
        const scored: PrivateKind = candidates.some((c) => allowed.has(c))
          ? "credited"
          : candidates.some((c) => publicOnly.has(c))
            ? "visibility"
            : candidates.some((c) => (global.get(c) ?? []).some(elsewhere))
              ? "moved"
              : "novel";
        const receipt = receipts.get(allowKeyOf({ package: pkg, tsFile, name: p.name }));
        if (receipt !== undefined && scored === "credited") stale.push(receipt);
        const kind: PrivateKind =
          receipt !== undefined && scored !== "credited" ? "allowed" : scored;
        totals.population += 1;
        totals[kind] += 1;
        if (p.perf === true && (kind === "novel" || kind === "moved")) totals.perf += 1;
        names.push({
          ...p,
          package: pkg,
          tsFile,
          rubyFile,
          kind,
          ...(receipt !== undefined ? { receipted: true as const } : {}),
        });
      }
    }
    packages.push(totals);
  }
  return { packages, names, stale };
}

export function formatPrivatesReport(report: PrivatesReport): string {
  const columns = [
    "population",
    "credited",
    "visibility",
    "moved",
    "novel",
    "allowed",
    "perf",
  ] as const;
  const header = ["package", ...columns];
  const rows = report.packages.map((t) => [t.package, ...columns.map((c) => String(t[c]))]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (r: string[]): string =>
    r.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ");
  return [line(header), ...rows.map(line)].join("\n");
}

export function parsePrivatesArgs(argv: string[]): {
  filterPkg: string | null;
  json: boolean;
  help: boolean;
} {
  let filterPkg: string | null = null;
  let json = false;
  let help = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--package") filterPkg = argv[++i] ?? null;
    else if (argv[i] === "--json") json = true;
    else if (argv[i] === "--help" || argv[i] === "-h") help = true;
  }
  return { filterPkg, json, help };
}

/**
 * The STALE gate of this lane: a receipt on a name a Ruby private/protected
 * method of the mirrored `.rb` credits. Same message shape as `gateStale`.
 */
export function gatePrivatesStale(report: PrivatesReport): string | null {
  if (report.stale.length === 0) return null;
  return (
    `\nprivates-surface: ${report.stale.length} STALE @noRailsEquivalent tag(s) on ` +
    "internal declarations a Rails private/protected method of the mirrored file " +
    "credits — the receipt covers nothing. Delete the tag next to the code:\n" +
    report.stale.map((e) => `  - ${e.package}  ${e.tsFile}  ${e.name}`).join("\n") +
    "\n"
  );
}

export async function main(argv: string[]): Promise<{ out: string; failure: string | null }> {
  const args = parsePrivatesArgs(argv);
  if (args.help) return { out: HELP, failure: null };
  const read = async (file: string): Promise<ApiManifest> =>
    JSON.parse(await fsp.readFile(path.join(OUTPUT_DIR, file), "utf-8"));
  const report = buildPrivatesReport(await read("rails-api.json"), await read("ts-api.json"), {
    filterPkg: args.filterPkg,
  });
  return {
    out: args.json ? JSON.stringify(report, null, 2) : formatPrivatesReport(report),
    failure: gatePrivatesStale(report),
  };
}

const host = (globalThis as { process?: { argv?: string[]; exitCode?: number } }).process;
const argv = host?.argv;
if (argv !== undefined && path.basename(argv[1] ?? "") === "privates-surface.ts") {
  void main(argv.slice(2)).then(
    ({ out, failure }) => {
      console.log(out);
      if (failure === null) return;
      console.error(failure);
      if (host !== undefined) host.exitCode = 1;
    },
    (error: unknown) => {
      const missing = (error as { code?: unknown } | null)?.code === "ENOENT";
      console.error(
        missing
          ? `${(error as Error).message}\nRun \`pnpm parity:api\` first to generate the manifests.`
          : error,
      );
      if (host !== undefined) host.exitCode = 1;
    },
  );
}
