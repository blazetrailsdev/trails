/**
 * The AR-closure activesupport TEST manifest: which Rails activesupport test
 * files cover the part of activesupport that activerecord + activemodel
 * actually depend on.
 *
 * The *member* closure already exists and is derived at run time by
 * `scripts/api-compare/ar-closure.ts` (RFC 0098) — a transitive walk of
 * `require "…"` from `activerecord/lib` + `activemodel/lib`. This module is
 * the same closure expressed as a test-file boundary, because
 * `vendor/rails/activesupport/test/` is organized by feature, not by consumer.
 *
 * The boundary is two derived rules plus a reviewed table:
 *
 *   R1 path — the test path minus `_test.rb` (plus its `_ext`-stripped and
 *             pluralized variants) names a closure file.
 *             `core_ext/numeric_ext_test.rb` → `core_ext/numeric.rb`
 *   R2 dir  — the same stem names a directory holding at least one closure file.
 *             `core_ext/hash_ext_test.rb` → `core_ext/hash/*`
 *   alias   — CLOSURE_ALIASES in ./aliases.ts, one reviewed reason per row.
 *
 * This is a manifest, not an exclusion registry: it removes nothing from any
 * denominator and touches no baseline.
 */

import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import { deriveArClosure } from "../api-compare/ar-closure.js";
import { testPathsManifest } from "../../vendor/sources.js";
import { CLOSURE_ALIASES, OUT_OF_CLOSURE_TEST_FILES } from "./closure-aliases.js";

export type ClosureRule = "R1" | "R2" | "alias";

export interface ClosureVerdict {
  testFile: string;
  inClosure: boolean;
  /** Which rule put it in the closure; undefined when it is out. */
  rule?: ClosureRule;
  /** The closure file it maps onto, `active_support/…`; undefined when out. */
  closureFile?: string;
}

export interface ClosurePartition {
  /** Closure files as `active_support/….rb`, derived on every run. */
  closureFiles: string[];
  inClosure: ClosureVerdict[];
  outOfClosure: ClosureVerdict[];
  /** Files listed as out-of-closure that no longer exist under the test tree. */
  staleOutOfClosure: string[];
  /** Files that are neither derived, nor aliased, nor explicitly listed out. */
  unclassified: string[];
}

/**
 * The closure as `active_support/….rb` paths. `deriveArClosure` reports them
 * relative to the package root (`values/time_zone.rb`); the `active_support/`
 * prefix is how Rails' own `require` lines — and so the alias table — spell
 * them.
 */
export function closureFiles(): string[] {
  return deriveArClosure().files.activesupport.map((file) => `active_support/${file}`);
}

/**
 * The stem variants R1/R2 try: the test path itself, the same path with a
 * trailing `_ext` stripped (`numeric_ext` → `numeric`), and the pluralized
 * form of each (`core_ext/hash/key` → `keys`).
 */
export function stemVariants(testFile: string): string[] {
  const stem = testFile.replace(/_test\.rb$/, "");
  const segments = stem.split("/");
  const last = segments[segments.length - 1];
  const variants = new Set<string>([stem]);
  if (last.endsWith("_ext")) {
    variants.add([...segments.slice(0, -1), last.slice(0, -"_ext".length)].join("/"));
  }
  for (const variant of [...variants]) variants.add(`${variant}s`);
  return [...variants];
}

export function classifyTestFile(testFile: string, files: readonly string[]): ClosureVerdict {
  for (const stem of stemVariants(testFile)) {
    const path = `active_support/${stem}.rb`;
    if (files.includes(path)) return { testFile, inClosure: true, rule: "R1", closureFile: path };
  }
  for (const stem of stemVariants(testFile)) {
    const dir = `active_support/${stem}/`;
    const hit = files.find((file) => file.startsWith(dir));
    if (hit) return { testFile, inClosure: true, rule: "R2", closureFile: hit };
  }
  const alias = CLOSURE_ALIASES.find((entry) => entry.testFile === testFile);
  if (alias) {
    return { testFile, inClosure: true, rule: "alias", closureFile: alias.closureFile };
  }
  return { testFile, inClosure: false };
}

async function railsTestFiles(dir: string, root: string): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await railsTestFiles(path, root)));
    else if (entry.name.endsWith("_test.rb")) out.push(relative(root, path));
  }
  return out;
}

export async function partitionActivesupportTests(): Promise<ClosurePartition> {
  const files = closureFiles();
  const root = testPathsManifest().activesupport;
  const testFiles = (await railsTestFiles(root, root)).sort();

  const inClosure: ClosureVerdict[] = [];
  const outOfClosure: ClosureVerdict[] = [];
  const unclassified: string[] = [];
  for (const testFile of testFiles) {
    const verdict = classifyTestFile(testFile, files);
    if (verdict.inClosure) inClosure.push(verdict);
    else if (OUT_OF_CLOSURE_TEST_FILES.includes(testFile)) outOfClosure.push(verdict);
    else unclassified.push(testFile);
  }

  const present = new Set(testFiles);
  const staleOutOfClosure = OUT_OF_CLOSURE_TEST_FILES.filter((file) => !present.has(file));

  return { closureFiles: files, inClosure, outOfClosure, staleOutOfClosure, unclassified };
}

/** Contradictions in the checked-in tables themselves. */
export function tableProblems(partition: ClosurePartition): string[] {
  const problems: string[] = [];
  for (const file of partition.unclassified) {
    problems.push(
      `${file} is neither derived by R1/R2 nor aliased nor listed out-of-closure. ` +
        "Add a CLOSURE_ALIASES row (with the closure file it covers) or an " +
        "OUT_OF_CLOSURE_TEST_FILES entry in scripts/test-compare/closure-aliases.ts.",
    );
  }
  for (const file of partition.staleOutOfClosure) {
    problems.push(
      `${file} is listed out-of-closure but no longer exists under the Rails test tree.`,
    );
  }
  for (const alias of CLOSURE_ALIASES) {
    if (OUT_OF_CLOSURE_TEST_FILES.includes(alias.testFile)) {
      problems.push(
        `${alias.testFile} is both aliased into the closure and listed out-of-closure.`,
      );
    }
    if (!partition.closureFiles.includes(alias.closureFile)) {
      problems.push(
        `${alias.testFile} aliases ${alias.closureFile}, which is not in the AR closure.`,
      );
    }
  }
  return problems;
}
