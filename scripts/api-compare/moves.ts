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
import { OUTPUT_DIR } from "./config.js";

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
  moves: MoveResult[];
}

interface PackageResult {
  package: string;
  files: FileResult[];
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

    // Collect all moves grouped by actualFile → expectedFile
    const movesByRoute = new Map<string, MoveResult[]>();
    for (const file of pkg.files) {
      for (const move of file.moves || []) {
        const key = `${move.actualFile} → ${move.expectedFile}`;
        const list = movesByRoute.get(key) || [];
        list.push(move);
        movesByRoute.set(key, list);
      }
    }

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

main();
