#!/usr/bin/env npx tsx
/**
 * Generate a relocation plan for methods that are matched via include chain
 * but live in the wrong file.
 *
 * Reads the api-comparison.json output from compare.ts and groups methods
 * by source → destination, showing exactly what needs to move where.
 *
 * Usage:
 *   npx tsx scripts/api-compare/moves.ts [--package activerecord]
 */

import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR } from "./config.js";

export interface MoveResult {
  tsName: string;
  rubyName: string;
  rubyModule: string;
  expectedFile: string;
  actualFile: string;
  inDefiningFile?: true;
}

export interface FileResult {
  rubyFile: string;
  expectedTsFile: string;
  moves: MoveResult[];
}

interface PackageResult {
  package: string;
  files: FileResult[];
}

/**
 * The relocation plan for one package: every move grouped by
 * `actualFile → expectedFile`.
 *
 * A move flagged `inDefiningFile` is left out. Ruby's `include` flattens
 * `DatabaseStatements#open_transactions`
 * (`connection_adapters/abstract/database_statements.rb:367`) onto
 * `AbstractAdapter`, so compare.ts expects it in abstract-adapter.ts and
 * credits it through the body in abstract/database-statements.ts. That body
 * is in the file Rails defines it in; the host carries at most a bodiless
 * `interface AbstractAdapter` signature, the type-level cost of `include`.
 * Reporting it would tell the reader to move a method out of its Rails file.
 */
export function relocationsByRoute(files: readonly FileResult[]): Map<string, MoveResult[]> {
  const movesByRoute = new Map<string, MoveResult[]>();
  for (const file of files) {
    for (const move of file.moves || []) {
      if (move.inDefiningFile === true) continue;
      const key = `${move.actualFile} → ${move.expectedFile}`;
      const list = movesByRoute.get(key) || [];
      list.push(move);
      movesByRoute.set(key, list);
    }
  }
  return movesByRoute;
}

function main() {
  const args = process.argv.slice(2);
  const pkgIndex = args.indexOf("--package");
  let filterPkg: string | null = null;
  if (pkgIndex !== -1) {
    const value = args[pkgIndex + 1];
    if (!value || value.startsWith("--")) {
      console.error("--package requires a package name");
      process.exit(1);
    }
    filterPkg = value;
  }

  const jsonPath = path.join(OUTPUT_DIR, "api-comparison.json");
  if (!fs.existsSync(jsonPath)) {
    console.error("Missing api-comparison.json — run compare.ts first");
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const results: PackageResult[] = data.results;

  for (const pkg of results) {
    if (filterPkg && pkg.package !== filterPkg) continue;

    const movesByRoute = relocationsByRoute(pkg.files);

    if (movesByRoute.size === 0) continue;

    const totalMoves = [...movesByRoute.values()].reduce((sum, m) => sum + m.length, 0);
    console.log(`\n${"=".repeat(100)}`);
    console.log(`  ${pkg.package}  —  ${totalMoves} methods to relocate`);
    console.log(`${"=".repeat(100)}`);

    // Sort by most methods to move
    const sorted = [...movesByRoute.entries()].sort((a, b) => b[1].length - a[1].length);

    for (const [route, methods] of sorted) {
      console.log(`\n  ${route}  (${methods.length} methods)`);
      for (const m of methods) {
        console.log(`    ${m.tsName}  (${m.rubyModule}::${m.rubyName})`);
      }
    }
  }

  console.log("");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
