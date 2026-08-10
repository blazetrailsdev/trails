#!/usr/bin/env npx tsx
/**
 * Gate for the reasoned inheritance-exclude file (RFC 0072):
 *
 *   pnpm tsx scripts/api-compare/lint-inheritance-excludes.ts   # gate (CI)
 *
 * Fails on a malformed entry (parseInheritanceExcludes raises) or a STALE one —
 * committed but absent from the artifact's `appliedInheritanceExcludes`, i.e.
 * it suppressed nothing in the run that wrote it. That is what makes the file
 * only-shrink: once a class converges, its entry has to be deleted by hand.
 *
 * There is deliberately no `--write` reseed: an exclude must be written by
 * hand with its justification, which is the whole point of the `reason` field.
 *
 * Hard rules: no node:* imports, no process.* in the library surface (the CLI
 * entry guard is the sole exception, matching lint-arity-excludes.ts), async fs
 * only.
 */

import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  INHERITANCE_EXCLUDE_PATH,
  findStaleInheritanceExcludes,
  inheritanceExcludeKeyOf,
  loadInheritanceExcludes,
  type InheritanceExcludeEntry,
} from "./inheritance-exclude.js";
import { OUTPUT_DIR, PACKAGES, ROOT_DIR } from "./config.js";

// Full-surface artifact only; compare.ts also writes --public-only /
// --privates-only variants, but excludes are written against the default run.
const ARTIFACT_PATH = path.join(OUTPUT_DIR, "api-comparison.json");

export interface ComparisonArtifact {
  results?: { package: string }[];
  /** Exclude keys that suppressed a real mismatch in this run. */
  appliedInheritanceExcludes?: string[];
}

/** Packages absent from the artifact: a `--package`-filtered (or otherwise
 *  partial) run would report every other package's excludes as stale. Same
 *  determinism guard as lint-arity-excludes.ts. */
export function missingScope(
  artifact: ComparisonArtifact,
  expected: readonly string[] = PACKAGES,
): string[] {
  const present = new Set((artifact.results ?? []).map((r) => r.package));
  return expected.filter((p) => !present.has(p)).sort();
}

export async function loadArtifact(file: string = ARTIFACT_PATH): Promise<ComparisonArtifact> {
  const exists = await fs.access(file).then(
    () => true,
    () => false,
  );
  if (!exists) {
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, file)} — run \`pnpm exec tsx ` +
        "scripts/api-compare/compare.ts` (or `pnpm parity:api`) first to write it.",
    );
  }
  return JSON.parse(await fs.readFile(file, "utf-8")) as ComparisonArtifact;
}

export function reportStale(stale: readonly InheritanceExcludeEntry[]): string {
  return (
    `\ninheritance excludes: ${stale.length} STALE entr(ies) that no longer suppress a mismatch.\n` +
    `The exclude file only shrinks — delete the converged entr(ies) from ` +
    `${path.relative(ROOT_DIR, INHERITANCE_EXCLUDE_PATH)}:\n` +
    stale.map((e) => `  - ${inheritanceExcludeKeyOf(e)}`).join("\n") +
    "\n"
  );
}

async function main(): Promise<number> {
  const entries = await loadInheritanceExcludes();
  const artifact = await loadArtifact();

  const absent = missingScope(artifact);
  if (absent.length > 0) {
    console.error(
      `\ninheritance excludes: artifact compared a PARTIAL scope — missing ` +
        `${absent.length} package(s): ${absent.join(", ")}.\n` +
        "Every other package's excludes would read as stale. Regenerate the " +
        "full surface with `pnpm parity:api`.\n",
    );
    return 1;
  }

  const stale = findStaleInheritanceExcludes(entries, artifact.appliedInheritanceExcludes ?? []);
  if (stale.length > 0) {
    console.error(reportStale(stale));
    return 1;
  }

  console.log(`inheritance excludes: OK (${entries.length} reasoned exclusion(s))`);
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
    console.error(`\ninheritance excludes: ${(e as Error).message}\n`);
    code = 1;
  }
  process.exit(code);
}

void runAsScript();
