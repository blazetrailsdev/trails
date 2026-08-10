#!/usr/bin/env npx tsx
/**
 * Gate against reintroduced legacy compare-script spellings (RFC 0092):
 *
 *   pnpm parity:legacy-names
 *
 * Population is the whole tree bar upstream Ruby and build output; the three
 * intentional mentions are allowlisted in `legacy-script-names.ts`, which is
 * also where the retired tokens live. There is no `--write`: the fix for a hit
 * is the `parity:*` spelling, never a new allowlist row.
 */

import * as path from "path";
import { fileURLToPath } from "url";
import { findLegacyScriptNames, reportHits } from "./legacy-script-names.js";

const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

async function main(): Promise<number> {
  const hits = await findLegacyScriptNames(ROOT_DIR);
  if (hits.length > 0) {
    console.error(reportHits(hits));
    return 1;
  }
  console.log("legacy compare-script spellings: OK (none reintroduced)");
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  let code: number;
  try {
    code = await main();
  } catch (e) {
    console.error(`\nlegacy compare-script spellings: ${(e as Error).message}\n`);
    code = 1;
  }
  process.exit(code);
}

void runAsScript();
