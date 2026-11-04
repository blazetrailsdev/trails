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
 * matches), `moved` (a Ruby method in another `.rb` matches), `novel`.
 */
import * as fsp from "fs/promises";
import * as path from "path";
import type { ApiManifest, ClassInfo, MethodInfo } from "@blazetrails/parity/types";
import { rubyFileToTs } from "@blazetrails/parity/conventions";
import { OUTPUT_DIR } from "./config.js";
import {
  buildCrossPackageModules,
  buildGlobalRubyCandidates,
  collectAllowedNames,
  indexRubyFiles,
  uncoveredTsFiles,
  type RubyOwner,
} from "./extra-surface.js";

export type PopulationKind = "modifier" | "internal" | "fileLocal" | "underscore";
export type PrivateKind = "credited" | "moved" | "novel";

export interface PopulationName {
  name: string;
  population: PopulationKind;
}

export interface PrivateName extends PopulationName {
  package: string;
  tsFile: string;
  rubyFile: string | null;
  kind: PrivateKind;
}

export interface PrivatesTotals {
  package: string;
  population: number;
  credited: number;
  moved: number;
  novel: number;
}

export interface PrivatesReport {
  packages: PrivatesTotals[];
  names: PrivateName[];
}

const HELP = `Usage: pnpm parity:api:privates [--package <name>] [--json]

Scores every internal TS declaration (private / protected / #, @internal,
file-local helpers, _-prefixed names) against the Ruby private/protected
methods of the mirrored .rb file:
  credited  a Ruby private/protected method of the mirrored .rb matches
  moved     a Ruby method elsewhere in the gem matches
  novel     nothing matches
Until privates-surface-visibility-column lands, a name whose only match in the
mirrored .rb is a Ruby PUBLIC method counts as novel. A _ name is matched with
its leading _ stripped once. Report-only: it never fails.`;

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
  const out = new Map<string, PopulationKind>();
  const add = (name: string, population: PopulationKind | null): void => {
    if (population !== null && name !== "constructor" && !out.has(name)) out.set(name, population);
  };
  for (const c of [...classes, ...modules]) {
    if (c.file !== file || c.synthesizedMixin === true) continue;
    if (c.isInterface === true && c.declaredAsNamespace !== true) continue;
    for (const m of [...c.instanceMethods, ...c.classMethods]) {
      if (m.declaredIn !== undefined) continue;
      add(m.name, memberPopulation(m));
    }
  }
  for (const fn of fileFunctions ?? []) {
    if (fn.reExportedFrom !== undefined || fn.aliasOf !== undefined) continue;
    if (fn.name.startsWith("_")) add(fn.name, "underscore");
    else if (fn.visibility === "private") add(fn.name, "fileLocal");
    else if (fn.internal === true) add(fn.name, "internal");
  }
  for (const name of internalConstants) add(name, name.startsWith("_") ? "underscore" : "internal");
  for (const name of fileConstants) if (name.startsWith("_")) add(name, "underscore");
  return [...out].map(([name, population]) => ({ name, population }));
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
  const packages: PrivatesTotals[] = [];
  const names: PrivateName[] = [];
  for (const [pkg, rubyPkgSource] of Object.entries(ruby.packages)) {
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
    const totals: PrivatesTotals = { package: pkg, population: 0, credited: 0, moved: 0, novel: 0 };
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
      const allowed =
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
              "private",
            );
      const elsewhere = (owner: RubyOwner): boolean =>
        owner.package !== pkg || owner.file !== rubyFile;
      for (const p of population) {
        const candidates = matchNames(p.name);
        const kind: PrivateKind = candidates.some((c) => allowed.has(c))
          ? "credited"
          : candidates.some((c) => (global.get(c) ?? []).some(elsewhere))
            ? "moved"
            : "novel";
        totals.population += 1;
        totals[kind] += 1;
        names.push({ ...p, package: pkg, tsFile, rubyFile, kind });
      }
    }
    packages.push(totals);
  }
  return { packages, names };
}

export function formatPrivatesReport(report: PrivatesReport): string {
  const header = ["package", "population", "credited", "moved", "novel"];
  const rows = report.packages.map((t) => [
    t.package,
    String(t.population),
    String(t.credited),
    String(t.moved),
    String(t.novel),
  ]);
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

export async function main(argv: string[]): Promise<string> {
  const args = parsePrivatesArgs(argv);
  if (args.help) return HELP;
  const read = async (file: string): Promise<ApiManifest> =>
    JSON.parse(await fsp.readFile(path.join(OUTPUT_DIR, file), "utf-8"));
  const report = buildPrivatesReport(await read("rails-api.json"), await read("ts-api.json"), {
    filterPkg: args.filterPkg,
  });
  return args.json ? JSON.stringify(report, null, 2) : formatPrivatesReport(report);
}

const argv = (globalThis as { process?: { argv?: string[] } }).process?.argv;
if (argv !== undefined && path.basename(argv[1] ?? "") === "privates-surface.ts") {
  void main(argv.slice(2)).then(
    (out) => console.log(out),
    (error: unknown) =>
      console.error(
        `${error instanceof Error ? error.message : String(error)}\nRun \`pnpm parity:api\` first to generate the manifests.`,
      ),
  );
}
