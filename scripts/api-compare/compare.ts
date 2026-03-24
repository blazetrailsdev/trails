#!/usr/bin/env npx tsx
/**
 * Convention-based API comparison.
 *
 * Compares Ruby Rails API surface with our TypeScript API using only naming
 * conventions — no manual mappings.
 *
 * For each Ruby class/module, derives the expected TS class name and file
 * location from conventions:
 *   - Class name: short name (last segment of FQN)
 *   - File path: Ruby path with .rb → .ts, snake_case → kebab-case
 *
 * Reports: found (correct file), found (misplaced), missing.
 *
 * Usage:
 *   npx tsx scripts/api-compare/compare.ts [--package activerecord] [--methods] [--missing]
 */

import * as fs from "fs";
import * as path from "path";
import type { ApiManifest, ClassInfo, MethodInfo } from "./types.js";

const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, "output");

const DETAIL_PACKAGES = new Set([
  "arel",
  "activemodel",
  "activerecord",
  "activesupport",
  "actiondispatch",
  "actioncontroller",
]);

// ---------------------------------------------------------------------------
// Conventions
// ---------------------------------------------------------------------------

function snakeToCamel(name: string): string {
  return name.replace(/_([a-z0-9])/g, (_, ch: string) => ch.toUpperCase());
}

/** Ruby file path → expected TS file path (kebab-case, .ts extension) */
function rubyFileToTs(rubyFile: string): string {
  const dir = path.dirname(rubyFile);
  const base = path.basename(rubyFile, ".rb");
  const kebab = base.replace(/_/g, "-");
  const tsFile = kebab + ".ts";
  if (dir === ".") return tsFile;
  const tsDir = dir
    .split("/")
    .map((d) => d.replace(/_/g, "-"))
    .join("/");
  return path.join(tsDir, tsFile);
}

/** FQN → short class name */
function shortName(fqn: string): string {
  const parts = fqn.split("::");
  return parts[parts.length - 1];
}

const OPERATORS = new Set([
  "[]",
  "[]=",
  "==",
  "===",
  "!=",
  "<=>",
  "+",
  "-",
  "*",
  "/",
  "%",
  "&",
  "|",
  "^",
  "~",
  "!",
  "!~",
  "=~",
  ">>",
  "<<",
  "~@",
]);

const SKIP = new Set([
  "dup",
  "clone",
  "freeze",
  "hash",
  "inspect",
  "pretty_print",
  "object_id",
  "class",
  "send",
  "public_send",
  "tap",
  "then",
  "yield_self",
  "respond_to?",
  "respond_to_missing?",
  "method_missing",
  "is_a?",
  "kind_of?",
  "instance_of?",
  "nil?",
  "equal?",
  "eql?",
  "instance_variable_get",
  "instance_variable_set",
  "instance_variables",
  "initialize_copy",
  "initialize_dup",
  "initialize_clone",
  "encode_with",
  "init_with",
  "to_ary",
  "to_a",
  "to_i",
  "to_f",
  "to_h",
  "to_hash",
  "to_r",
  "to_c",
]);

/** Convert Ruby method name → expected TS name (null = skip) */
function rubyMethodToTs(name: string): string | null {
  if (OPERATORS.has(name)) return null;
  if (SKIP.has(name)) return null;

  // Skip _-prefixed
  if (name.startsWith("_")) return null;

  // Special conversions
  if (name === "initialize") return "constructor";
  if (name === "to_s" || name === "to_str") return "toString";
  if (name === "to_json") return "toJSON";
  if (name === "to_sql") return "toSql";

  // Predicate: foo? → isFoo
  if (name.endsWith("?")) {
    const base = name.slice(0, -1);
    return "is" + snakeToCamel(base).replace(/^./, (c) => c.toUpperCase());
  }

  // Bang: foo! → fooBang
  if (name.endsWith("!")) {
    const base = name.slice(0, -1);
    return snakeToCamel(base) + "Bang";
  }

  // Setter: foo= → foo (camelCase)
  if (name.endsWith("=")) {
    const base = name.slice(0, -1);
    return snakeToCamel(base);
  }

  return snakeToCamel(name);
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClassStatus = "found" | "misplaced" | "missing";

interface ClassResult {
  rubyFqn: string;
  rubyShortName: string;
  rubyFile: string;
  expectedTsFile: string;
  actualTsFile: string | null;
  kind: "class" | "module";
  status: ClassStatus;
  methodsMatched: number;
  methodsMissing: number;
  methodsExtra: number;
  missingMethods: string[];
}

interface FileResult {
  rubyFile: string;
  expectedTsFile: string;
  tsFileExists: boolean;
  classes: ClassResult[];
  found: number;
  misplaced: number;
  missing: number;
}

interface PackageResult {
  package: string;
  totalClasses: number;
  found: number;
  misplaced: number;
  missing: number;
  percent: number;
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
  const showMethods = args.includes("--methods");
  const showMissing = args.includes("--missing");

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

    // Build TS lookup: shortName → { file, classInfo }[]
    const tsClassesByName = new Map<string, { file: string; info: ClassInfo }[]>();
    if (tsPkg) {
      for (const [name, cls] of Object.entries(tsPkg.classes)) {
        const entries = tsClassesByName.get(name) || [];
        entries.push({ file: cls.file || "", info: cls });
        tsClassesByName.set(name, entries);
      }
    }

    // Build set of all TS files in this package
    const tsFileSet = new Set<string>();
    if (tsPkg) {
      for (const cls of Object.values(tsPkg.classes)) {
        if (cls.file) tsFileSet.add(cls.file);
      }
    }

    // Collect all Ruby classes and modules
    const allRuby: {
      fqn: string;
      info: ClassInfo;
      kind: "class" | "module";
    }[] = [];
    for (const [fqn, info] of Object.entries(rubyPkg.classes)) {
      allRuby.push({
        fqn,
        info: info as unknown as ClassInfo,
        kind: "class",
      });
    }
    for (const [fqn, info] of Object.entries(rubyPkg.modules)) {
      allRuby.push({
        fqn,
        info: info as unknown as ClassInfo,
        kind: "module",
      });
    }

    // Group by Ruby file
    const byFile = new Map<string, typeof allRuby>();
    for (const item of allRuby) {
      const file = item.info.file || "unknown.rb";
      const list = byFile.get(file) || [];
      list.push(item);
      byFile.set(file, list);
    }

    // Track which TS classes have been consumed (to avoid double-matching
    // when two Ruby FQNs share the same short name, e.g., Base)
    const consumedTs = new Set<string>(); // "name:file" keys

    let totalFound = 0;
    let totalMisplaced = 0;
    let totalMissing = 0;
    const fileResults: FileResult[] = [];

    for (const [rubyFile, items] of [...byFile.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const expectedTs = rubyFileToTs(rubyFile);
      const tsFileExists = tsFileSet.has(expectedTs);
      const classResults: ClassResult[] = [];
      let fileFound = 0;
      let fileMisplaced = 0;
      let fileMissing = 0;

      for (const item of items) {
        const name = shortName(item.fqn);
        const tsEntries = tsClassesByName.get(name) || [];

        // Prefer match in expected file, then any unconsumed match
        const inExpected = tsEntries.find(
          (e) => e.file === expectedTs && !consumedTs.has(`${name}:${e.file}`),
        );
        const inAny = tsEntries.find((e) => !consumedTs.has(`${name}:${e.file}`));

        let status: ClassStatus;
        let actualFile: string | null = null;
        let tsClass: ClassInfo | null = null;

        if (inExpected) {
          status = "found";
          actualFile = expectedTs;
          tsClass = inExpected.info;
          consumedTs.add(`${name}:${expectedTs}`);
          fileFound++;
          totalFound++;
        } else if (inAny) {
          status = "misplaced";
          actualFile = inAny.file;
          tsClass = inAny.info;
          consumedTs.add(`${name}:${inAny.file}`);
          fileMisplaced++;
          totalMisplaced++;
        } else {
          status = "missing";
          fileMissing++;
          totalMissing++;
        }

        // Method comparison for found/misplaced classes
        let methodsMatched = 0;
        let methodsMissing = 0;
        let methodsExtra = 0;
        const missingMethods: string[] = [];

        if (tsClass) {
          const tsMethodNames = new Set<string>();
          for (const m of [...tsClass.instanceMethods, ...tsClass.classMethods]) {
            tsMethodNames.add(m.name);
          }

          const rubyMethods = [...item.info.instanceMethods, ...item.info.classMethods];
          const mappedTsNames = new Set<string>();

          for (const rm of rubyMethods) {
            const tsName = rubyMethodToTs(rm.name);
            if (tsName === null) continue;
            mappedTsNames.add(tsName);
            if (tsMethodNames.has(tsName)) {
              methodsMatched++;
            } else {
              methodsMissing++;
              missingMethods.push(`${rm.name} → ${tsName}`);
            }
          }

          for (const tsName of tsMethodNames) {
            if (!mappedTsNames.has(tsName) && tsName !== "constructor") {
              methodsExtra++;
            }
          }
        }

        classResults.push({
          rubyFqn: item.fqn,
          rubyShortName: name,
          rubyFile,
          expectedTsFile: expectedTs,
          actualTsFile: actualFile,
          kind: item.kind,
          status,
          methodsMatched,
          methodsMissing,
          methodsExtra,
          missingMethods,
        });
      }

      fileResults.push({
        rubyFile,
        expectedTsFile: expectedTs,
        tsFileExists,
        classes: classResults,
        found: fileFound,
        misplaced: fileMisplaced,
        missing: fileMissing,
      });
    }

    const total = totalFound + totalMisplaced + totalMissing;
    const pct = total > 0 ? Math.round((totalFound / total) * 1000) / 10 : 0;

    results.push({
      package: pkg,
      totalClasses: total,
      found: totalFound,
      misplaced: totalMisplaced,
      missing: totalMissing,
      percent: pct,
      files: fileResults,
    });
  }

  // Write JSON
  const jsonPath = path.join(OUTPUT_DIR, "api-comparison.json");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  );

  printReport(results, showMethods, showMissing, filterPkg);
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport(
  results: PackageResult[],
  showMethods: boolean,
  showMissing: boolean,
  filterPkg: string | null,
) {
  let grandTotal = 0;
  let grandFound = 0;
  let grandMisplaced = 0;

  for (const pkg of results) {
    grandTotal += pkg.totalClasses;
    grandFound += pkg.found;
    grandMisplaced += pkg.misplaced;

    console.log(`\n${"=".repeat(100)}`);
    console.log(
      `  ${pkg.package}  —  ${pkg.found}/${pkg.totalClasses} classes/modules (${pkg.percent}%)  |  ${pkg.misplaced} misplaced  |  ${pkg.missing} missing`,
    );
    console.log(`${"=".repeat(100)}`);

    // Misplaced classes summary
    const misplaced = pkg.files.flatMap((f) => f.classes.filter((c) => c.status === "misplaced"));
    if (misplaced.length > 0) {
      console.log(`\n  MISPLACED (need to move):`);
      console.log(`  ${"-".repeat(96)}`);

      const moves = new Map<string, { items: string[]; from: string; to: string }>();
      for (const c of misplaced) {
        const key = `${c.actualTsFile} → ${c.expectedTsFile}`;
        if (!moves.has(key))
          moves.set(key, {
            items: [],
            from: c.actualTsFile!,
            to: c.expectedTsFile,
          });
        moves.get(key)!.items.push(`${c.rubyShortName} (${c.kind})`);
      }

      for (const [, move] of moves) {
        console.log(`\n  ${move.from}  →  ${move.to}  (${move.items.length})`);
        for (const item of move.items) {
          console.log(`    - ${item}`);
        }
      }
      console.log("");
    }

    // Per-file table (only for detail packages or when filtered)
    if (DETAIL_PACKAGES.has(pkg.package) || filterPkg) {
      console.log(
        `\n  ${"Ruby file".padEnd(55)} ${"Convention TS".padEnd(40)} ${"OK".padStart(4)} ${"Move".padStart(4)} ${"Miss".padStart(4)} ${"Tot".padStart(4)}`,
      );
      console.log(
        `  ${"-".repeat(55)} ${"-".repeat(40)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)} ${"-".repeat(4)}`,
      );

      for (const f of pkg.files) {
        const total = f.found + f.misplaced + f.missing;
        const marker = !f.tsFileExists ? " \u2717" : f.found === total ? " \u2713" : "";
        console.log(
          `  ${f.rubyFile.padEnd(55)} ${f.expectedTsFile.padEnd(40)} ${String(f.found).padStart(4)} ${String(f.misplaced).padStart(4)} ${String(f.missing).padStart(4)} ${String(total).padStart(4)}${marker}`,
        );

        if (showMissing) {
          for (const c of f.classes) {
            if (c.status === "missing") {
              console.log(`      - ${c.rubyFqn} (${c.kind})`);
            }
          }
        }

        if (showMethods) {
          for (const c of f.classes) {
            if (c.status !== "missing" && (c.methodsMatched > 0 || c.methodsMissing > 0)) {
              const methodTotal = c.methodsMatched + c.methodsMissing;
              const pct = methodTotal > 0 ? Math.round((c.methodsMatched / methodTotal) * 100) : 0;
              console.log(
                `      ${c.rubyShortName}: ${c.methodsMatched}/${methodTotal} methods (${pct}%)`,
              );
              for (const m of c.missingMethods.slice(0, 10)) {
                console.log(`        - ${m}`);
              }
              if (c.missingMethods.length > 10) {
                console.log(`        ... and ${c.missingMethods.length - 10} more`);
              }
            }
          }
        }
      }
    }
  }

  const grandPct = grandTotal > 0 ? Math.round((grandFound / grandTotal) * 1000) / 10 : 0;
  const grandMissing = grandTotal - grandFound - grandMisplaced;
  console.log(`\n${"=".repeat(100)}`);
  console.log(
    `  Overall: ${grandFound}/${grandTotal} classes/modules (${grandPct}%)  |  ${grandMisplaced} misplaced  |  ${grandMissing} missing`,
  );
  console.log(`${"=".repeat(100)}\n`);
}

main();
