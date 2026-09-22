#!/usr/bin/env npx tsx
/**
 * CI gate for the block-parameter ratchet (RFC 0156). A Ruby method that takes
 * a block — `&blk`, `yield`, `block_given?` — paired with a TS signature that
 * has no function-typed parameter is a dropped block arm (block-params.ts).
 *
 * Same contract as the parameter-name mark (lint-param-names.ts), whose mark
 * module this reuses over its own file: a committed per-package, per-Ruby-file
 * count, CI failing on ANY increase, `--tighten` narrowing and never widening,
 * and no reseed.
 *
 * Usage:
 *   pnpm parity:api:blocks            # gate (CI)
 *   pnpm parity:api:blocks:tighten    # narrow marks
 *
 * Run `pnpm parity:api` first so output/block-param-mismatches.json is fresh.
 *
 * Hard rules: no node:* imports, async fs only, no third-party runtime deps.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { OUTPUT_DIR, ROOT_DIR, SCRIPT_DIR } from "./config.js";
import { BLOCK_IDIOM } from "./block-params.js";
import {
  GATED_PACKAGES,
  exceedances,
  loadMarks,
  measure,
  staleMarks,
  tightened,
  unmarkedPackages,
  unmeasuredPackages,
  writeMarks,
  type MeasuredRow,
} from "./param-name-mark.js";

export const BLOCK_MARK_PATH = path.join(SCRIPT_DIR, "block-param-mark.json");

interface BlockParamArtifact {
  packages: string[];
  mismatches: (MeasuredRow & { rubyName: string; tsName: string })[];
}

async function main(tighten: boolean): Promise<number> {
  const file = path.join(OUTPUT_DIR, "block-param-mismatches.json");
  const artifact = JSON.parse(await fs.readFile(file, "utf-8")) as BlockParamArtifact;

  const absent = unmeasuredPackages(artifact.packages, GATED_PACKAGES);
  if (absent.length > 0) {
    console.error(
      `\nblock-param gate: gated package(s) not measured: ${absent.join(", ")}.\n` +
        "Regenerate:  API_COMPARE_FORCE=1 pnpm parity:api\n",
    );
    return 1;
  }
  const marks = await loadMarks(BLOCK_MARK_PATH);
  const unmarked = unmarkedPackages(marks, GATED_PACKAGES);
  if (unmarked.length > 0) {
    console.error(`\nblock-param gate: gated package(s) carry no mark: ${unmarked.join(", ")}.\n`);
    return 1;
  }

  const current = measure(artifact.mismatches, GATED_PACKAGES);
  const grew = exceedances(marks, current, GATED_PACKAGES);
  const stale = staleMarks(marks, current, GATED_PACKAGES);

  if (tighten) {
    if (grew.length > 0) {
      console.error("\nblock-param gate: refusing to tighten while the mark is EXCEEDED.\n");
      return 1;
    }
    await writeMarks(tightened(marks, current, GATED_PACKAGES), BLOCK_MARK_PATH);
    console.log(
      `Wrote ${path.relative(ROOT_DIR, BLOCK_MARK_PATH)}: narrowed ${stale.length} dimension(s).`,
    );
    return 0;
  }

  if (grew.length > 0) {
    console.error(`\nblock-param gate: ${grew.length} dimension(s) GREW past the committed mark.`);
    console.error(`Rails' method takes a block the port does not. ${BLOCK_IDIOM}\n`);
    for (const v of grew) {
      console.error(`  + ${v.package}  ${v.dimension}: mark ${v.mark} → current ${v.current}`);
      for (const row of artifact.mismatches) {
        if (row.package === v.package && row.rubyFile === v.dimension) {
          console.error(`      ${row.rubyName} → ${row.tsName}`);
        }
      }
    }
    return 1;
  }

  for (const v of stale) {
    console.log(
      `block-param gate: ${v.package} ${v.dimension} mark ${v.mark} is above the ` +
        `current ${v.current} — narrow it with \`pnpm parity:api:blocks:tighten\`.`,
    );
  }
  const total = Object.values(current).reduce((n, m) => n + m.total, 0);
  console.log(`block-param gate: OK (${total} dropped block arm(s) under the mark)`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  process.exit(await main(process.argv.slice(2).includes("--tighten")));
}

void runAsScript();
