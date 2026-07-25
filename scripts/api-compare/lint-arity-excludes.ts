#!/usr/bin/env npx tsx
/**
 * Gate for the reasoned arity-exclude file (RFC 0072).
 *
 * compare.ts suppresses a flagged arity pair when arity-exclude.json carries a
 * reasoned entry for it, and records the keys that actually suppressed
 * something in output/arity-mismatches.json (`appliedExcludes`). This script
 * fails on:
 *
 *   - a malformed entry (missing key field, empty `reason`, duplicate key) —
 *     parseArityExcludes raises;
 *   - a STALE entry: committed but unapplied in the run that wrote the
 *     artifact, i.e. the pair converged or no longer exists. Excludes are a
 *     ratchet, not a landfill, so the file can only shrink.
 *
 * The gate is NOT a ratchet on new mismatches — those stay advisory in the
 * artifact (the arity dimension never affects the parity %).
 *
 * Usage:
 *   pnpm tsx scripts/api-compare/lint-arity-excludes.ts   # gate (CI)
 *
 * There is deliberately no `--write` reseed: an exclude must be written by
 * hand with its justification, which is the whole point of the `reason` field.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-call-mismatches.ts), async
 * fs only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  ARITY_EXCLUDE_PATH,
  arityExcludeKeyOf,
  findStaleArityExcludes,
  loadArityExcludes,
  type ArityExcludeEntry,
} from "./arity-exclude.js";
import { OUTPUT_DIR, PACKAGES, ROOT_DIR } from "./config.js";

// Gates the full-surface artifact only (compare.ts also writes per-mode
// variants under --public-only/--privates-only); the excludes are written
// against the default full-surface run.
const ARTIFACT_PATH = path.join(OUTPUT_DIR, "arity-mismatches.json");

export interface ArityArtifact {
  /** Packages this run compared (compare.ts writes it sorted). */
  packages?: string[];
  /** Exclude keys that suppressed a real mismatch in this run. */
  appliedExcludes?: string[];
}

/**
 * Packages that should have been compared but are absent — a `--package`-
 * filtered or otherwise partial artifact would report every other package's
 * excludes as stale. Same determinism guard as lint-call-mismatches.ts.
 */
export function missingScope(
  artifact: ArityArtifact,
  expected: readonly string[] = PACKAGES,
): string[] {
  const present = new Set(artifact.packages ?? []);
  return expected.filter((p) => !present.has(p)).sort();
}

export async function loadArtifact(file: string = ARTIFACT_PATH): Promise<ArityArtifact> {
  const exists = await fs.access(file).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, file)} — run \`pnpm exec tsx ` +
        "scripts/api-compare/compare.ts` (or `pnpm api:compare`) first to write it.",
    );
  }
  return JSON.parse(await fs.readFile(file, "utf-8")) as ArityArtifact;
}

export function reportStale(stale: readonly ArityExcludeEntry[]): string {
  return (
    `\narity excludes: ${stale.length} STALE entr(ies) that no longer suppress a mismatch.\n` +
    `The exclude file only shrinks — delete the converged entr(ies) from ` +
    `${path.relative(ROOT_DIR, ARITY_EXCLUDE_PATH)}:\n` +
    stale.map((e) => `  - ${arityExcludeKeyOf(e)}`).join("\n") +
    "\n"
  );
}

async function main(): Promise<number> {
  const entries = await loadArityExcludes();
  const artifact = await loadArtifact();

  const absent = missingScope(artifact);
  if (absent.length > 0) {
    console.error(
      `\narity excludes: artifact compared a PARTIAL scope — missing ` +
        `${absent.length} package(s): ${absent.join(", ")}.\n` +
        "Every other package's excludes would read as stale. Regenerate the " +
        "full surface with `pnpm api:compare`.\n",
    );
    return 1;
  }

  const stale = findStaleArityExcludes(entries, artifact.appliedExcludes ?? []);
  if (stale.length > 0) {
    console.error(reportStale(stale));
    return 1;
  }

  console.log(`arity excludes: OK (${entries.length} reasoned exclusion(s))`);
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  let code = 0;
  try {
    code = await main();
  } catch (e) {
    console.error(`\narity excludes: ${(e as Error).message}\n`);
    code = 1;
  }
  process.exit(code);
}

void runAsScript();
