#!/usr/bin/env npx tsx
/**
 * Gate for the reasoned arity-exclude file (RFC 0072):
 *
 *   pnpm tsx scripts/api-compare/lint-arity-excludes.ts   # gate (CI)
 *
 * Fails on a malformed entry (parseArityExcludes raises) or a STALE one —
 * committed but absent from the artifact's `appliedExcludes`, i.e. it
 * suppressed nothing in the run that wrote it. It is NOT a ratchet on new
 * mismatches: those stay advisory (arity never affects the parity %).
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

// Full-surface artifact only; compare.ts also writes --public-only /
// --privates-only variants, but excludes are written against the default run.
const ARTIFACT_PATH = path.join(OUTPUT_DIR, "arity-mismatches.json");

export interface ArityArtifact {
  packages?: string[];
  /** Exclude keys that suppressed a real mismatch in this run. */
  appliedExcludes?: string[];
}

/** Packages absent from the artifact: a `--package`-filtered (or otherwise
 *  partial) run would report every other package's excludes as stale. Same
 *  determinism guard as lint-call-mismatches.ts. */
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
