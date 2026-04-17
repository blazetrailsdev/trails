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
 *   npx tsx scripts/api-compare/compare.ts [--package activerecord] [--missing] [--files] [--incomplete]
 */

import * as fs from "fs";
import * as path from "path";
import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";
import { OUTPUT_DIR, packageSrcDir } from "./config.js";
import { rubyFileToTs, rubyMethodToTs } from "./conventions.js";
import { isExcluded } from "./excluded-files.js";

const DETAIL_PACKAGES = new Set([
  "arel",
  "activemodel",
  "activerecord",
  "activesupport",
  "actiondispatch",
  "actioncontroller",
  "actionview",
]);

// Files intentionally excluded from comparison live in excluded-files.ts.

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
  excludedFiles: string[];
  files: FileResult[];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
    filterPkg = value;
  }
  const showMissing = args.includes("--missing");
  const showFiles = args.includes("--files");
  const showIncomplete = args.includes("--incomplete");

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

    // Build per-file method index from TS: file → Set<methodName>
    const tsMethodsByFile = new Map<string, Set<string>>();

    if (tsPkg) {
      const addMethods = (cls: ClassInfo) => {
        const file = cls.file || "";
        const methods = tsMethodsByFile.get(file) || new Set();
        for (const m of [...cls.instanceMethods, ...cls.classMethods]) {
          methods.add(m.name);
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
            methods.add(fn.name);
          }
          tsMethodsByFile.set(file, methods);
        }
      }
    }

    // Propagate inherited methods transitively: follows both class `superclass`
    // and interface/module `extends` chains.
    if (tsPkg) {
      // Key by short name → entity for superclass/extends resolution.
      // Multiple entities can share a name; store all and resolve by context.
      const entitiesByName = new Map<string, ClassInfo[]>();
      for (const entity of [...Object.values(tsPkg.classes), ...Object.values(tsPkg.modules)]) {
        const list = entitiesByName.get(entity.name) || [];
        list.push(entity);
        entitiesByName.set(entity.name, list);
      }

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
          methods.add(m.name);
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
          if (file) files.add(rubyFileToTs(file));
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
      if (isExcluded(file)) {
        excludedFiles.add(file);
        continue;
      }
      const list = byFile.get(file) || [];
      list.push(item);
      byFile.set(file, list);
    }

    // Resolve package src directory for file existence checks
    const pkgSrcDir = packageSrcDir(pkg);

    // Compare methods per file
    let totalMatched = 0;
    let totalMissing = 0;
    let totalFiles = 0;
    let filesExist = 0;
    const fileResults: FileResult[] = [];

    for (const [rubyFile, items] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const expectedTs = rubyFileToTs(rubyFile);
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

      // Deduplicate: collect all unique TS method names expected from this file.
      // Multiple Ruby classes in the same file often define the same method
      // (e.g., 8 subclasses in binary.rb each override `invert`). Count once.
      const seen = new Map<string, { rubyName: string; rubyModule: string }>();
      for (const item of items) {
        const rubyMethods = [...item.info.instanceMethods, ...item.info.classMethods];
        for (const rm of rubyMethods) {
          const tsCandidates = rubyMethodToTs(rm.name);
          if (tsCandidates === null) continue;
          const key = tsCandidates[0];
          if (!seen.has(key)) {
            seen.set(key, { rubyName: rm.name, rubyModule: item.fqn });
          }
        }
      }

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
        } else {
          fileMissing++;
          missingMethods.push({ rubyName, tsName: tsCandidates[0], rubyModule });
        }
      }

      const total = fileMatched + fileMissing;
      if (total === 0) continue;

      fileResults.push({
        rubyFile,
        expectedTsFile: expectedTs,
        tsFileExists,
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
    }

    const totalMethods = totalMatched + totalMissing;
    const pct = totalMethods > 0 ? Math.round((totalMatched / totalMethods) * 1000) / 10 : 0;

    results.push({
      package: pkg,
      totalMethods,
      matched: totalMatched,
      missing: totalMissing,
      percent: pct,
      totalFiles,
      filesExist,
      excludedFiles: [...excludedFiles].sort(),
      files: fileResults,
    });
  }

  // Write JSON
  const jsonPath = path.join(OUTPUT_DIR, "api-comparison.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );

  printReport(results, showMissing, showFiles, filterPkg, showIncomplete);
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
) {
  let grandTotal = 0;
  let grandMatched = 0;
  let grandFiles = 0;
  let grandFilesExist = 0;

  for (const pkg of results) {
    grandTotal += pkg.totalMethods;
    grandMatched += pkg.matched;
    grandFiles += pkg.totalFiles;
    grandFilesExist += pkg.filesExist;

    console.log(`\n${"=".repeat(100)}`);
    const excludedNote =
      pkg.excludedFiles.length > 0 ? "  (some intentionally excluded, see excluded-files.ts)" : "";
    console.log(
      `  ${pkg.package}  —  ${pkg.matched}/${pkg.totalMethods} methods (${pkg.percent}%)  |  files: ${pkg.filesExist}/${pkg.totalFiles}${excludedNote}`,
    );
    console.log(`${"=".repeat(100)}`);

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
        if (showIncomplete && f.total > 0 && f.matched === f.total) continue;
        const marker = !f.tsFileExists ? " \u2717" : f.matched === f.total ? " \u2713" : "";
        console.log(
          `  ${f.rubyFile.padEnd(55)} ${f.expectedTsFile.padEnd(40)} ${String(f.matched).padStart(6)} ${String(f.missing).padStart(6)} ${String(f.total).padStart(6)} ${String(pct).padStart(3)}%${marker}`,
        );

        if (showMissing) {
          for (const m of f.missingMethods) {
            console.log(`      - ${m.rubyName} → ${m.tsName}`);
          }
        }
      }

      for (const excluded of pkg.excludedFiles) {
        console.log(`  ${excluded.padEnd(55)} ${"(excluded)".padEnd(40)}`);
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
  console.log(
    `  Overall: ${grandMatched}/${grandTotal} methods (${grandPct}%)  |  files: ${grandFilesExist}/${grandFiles}`,
  );
  console.log(`${"=".repeat(100)}\n`);
}

main();
