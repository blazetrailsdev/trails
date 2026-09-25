#!/usr/bin/env npx tsx
/**
 * CI gate for the predicate-kind ratchet (RFC 0156). A Ruby predicate `foo?`
 * credited only through the bare candidate `foo`, by a getter or value whose
 * type cannot hold a boolean, is a predicate the port does not answer
 * (compare.ts `predicateKindMismatch`). Fails when a package's count rises above
 * its committed mark; a package with no mark is held to zero.
 *
 * Same contract as the ambiguous-parent mark (lint-ambiguous-parents.ts), whose
 * pure helpers this reuses over its own file: only-shrink, `--tighten` writes
 * DOWN and never up, and there is no reseed.
 *
 * Usage:
 *   pnpm parity:api:predicates            # gate (CI)
 *   pnpm parity:api:predicates:tighten    # narrow marks
 *
 * Run `pnpm parity:api` first so output/api-comparison.json is fresh.
 *
 * Hard rules: no node:* imports, async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { serializeBaseline } from "./baseline-json.js";
import { OUTPUT_DIR, ROOT_DIR, SCRIPT_DIR } from "./config.js";
import {
  exceedances,
  staleMarks,
  tightened,
  type AmbiguousParentCounts as PackageCounts,
} from "./lint-ambiguous-parents.js";

export const PREDICATE_MARK_PATH = path.join(SCRIPT_DIR, "predicate-kind-mark.json");

interface ApiComparison {
  results: {
    package: string;
    predicateKindMismatches: { rubyFile: string; rubyName: string; tsName: string }[];
  }[];
}

async function main(tighten: boolean): Promise<number> {
  const file = path.join(OUTPUT_DIR, "api-comparison.json");
  const { results } = JSON.parse(await fs.readFile(file, "utf-8")) as ApiComparison;
  const current: PackageCounts = {};
  for (const r of results) current[r.package] = r.predicateKindMismatches.length;
  const marks = JSON.parse(await fs.readFile(PREDICATE_MARK_PATH, "utf-8")) as PackageCounts;
  const grew = exceedances(marks, current);
  const stale = staleMarks(marks, current);

  if (tighten) {
    if (grew.length > 0) {
      console.error("\npredicate-kind gate: refusing to tighten while the mark is EXCEEDED.\n");
      return 1;
    }
    await fs.writeFile(PREDICATE_MARK_PATH, serializeBaseline(tightened(marks, current)));
    console.log(
      `Wrote ${path.relative(ROOT_DIR, PREDICATE_MARK_PATH)}: narrowed ${stale.length} package(s).`,
    );
    return 0;
  }

  if (grew.length > 0) {
    console.error(
      `\npredicate-kind gate: ${grew.length} package(s) GREW past the committed mark.\n` +
        "Answer the Ruby predicate with an `isX` member returning the value Rails does\n" +
        "rather than raising the mark.\n",
    );
    for (const v of grew) {
      console.error(`  + ${v.package}: mark ${v.mark} → current ${v.current}`);
      const rows = results.find((r) => r.package === v.package)!.predicateKindMismatches;
      for (const m of rows) console.error(`      ${m.rubyFile} ${m.rubyName} → ${m.tsName}`);
    }
    return 1;
  }

  for (const v of stale) {
    console.log(
      `predicate-kind gate: ${v.package} mark ${v.mark} is above the current ` +
        `${v.current} — narrow it with \`pnpm parity:api:predicates:tighten\`.`,
    );
  }
  console.log("predicate-kind gate: OK");
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main(process.argv.slice(2).includes("--tighten")));
}

void runAsScript();
