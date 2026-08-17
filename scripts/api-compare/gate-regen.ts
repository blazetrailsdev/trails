/**
 * Pre-gate artifact regeneration for the call-mismatch ratchet
 * (RFC 0083).
 *
 * `lint-call-mismatches.ts` gates an artifact `compare.ts` wrote.
 * Gating whatever is on disk is what makes a sibling PR's deleted TS method
 * surface as `STALE baseline entr(ies)` on a branch that never touched it, and
 * the fix was always "re-extract, then re-run" — so a local run does the
 * re-extraction itself. Regeneration goes through run.sh (`pnpm parity:api`)
 * rather than compare.ts so the extraction manifests compare.ts reads are
 * refreshed first.
 *
 * The opt-out contract: `--no-regen`, API_COMPARE_SKIP_REGEN=1, or any CI
 * value — CI runs the extraction step separately and must not pay for it twice.
 *
 * Hard rules: no node:* imports, no process.* (callers pass their own env),
 * async only.
 */

import { spawn } from "child_process";
import * as path from "path";
import { ROOT_DIR, apiComparePackageRoots } from "./config.js";
import { manifestIsStale } from "./build-freshness.js";

export const NO_REGEN_FLAG = "--no-regen";

export const REGEN_SKIP_ARGS = [NO_REGEN_FLAG, "--report", "--unreviewed"];

export const REGEN_SKIP_ENV = "API_COMPARE_SKIP_REGEN";

// A reseed regenerating a stale artifact is the same bug this closes, one
// severity worse: `--write` commits the stale population as the new baseline.
// So `--write` regenerates too — except under API_COMPARE_FORCE, the marker
// that the caller just ran the forced regeneration itself. (The reseed scripts
// pass `--no-regen` as well: their `API_COMPARE_FORCE=1 pnpm parity:api && …`
// assignment prefix applies only to the first command, so the `--write` step
// never sees the env marker.)
export function shouldRegenerate(argv: string[], env: Record<string, string | undefined>): boolean {
  if (argv.some((a) => REGEN_SKIP_ARGS.includes(a))) return false;
  if (argv.includes("--write") && env.API_COMPARE_FORCE) return false;
  return !env.CI && env[REGEN_SKIP_ENV] !== "1";
}

// `extraArgs` is the compare scope. It defaults to the artifact's, the
// only one compare.ts writes: a plain `pnpm parity:api` computes no call sets
// at all, so passing [] would regenerate nothing the gate can read.
//
// The regeneration is FORCED (RFC 0106). A cached regeneration is a PARTIAL
// one: `extract-ts-api.ts` serves any package whose own fingerprint and
// recorded read-set still validate, so the artifact the gate then reads mixes
// freshly-extracted packages with entries an earlier tree produced. Measured on
// PR #6647: a plain gate reported nine NEW mismatches in files the branch never
// touched — each in a package a sibling PR had just moved on `main` — while
// HIDING the one real row the branch introduced (`errors.ts copy! deep_dup`),
// which only surfaced in CI. Forced, the same tree reported exactly that row
// and none of the nine. Rows off a partly-cached artifact are unfalsifiable, so
// the gate pays the full extraction rather than print them; two of those
// phantoms became filed-and-closed stories before the artifact was suspected.
/**
 * The env the regeneration child runs with: the caller's, plus the force
 * marker. Separate from the spawn so the contract is testable without a real
 * `pnpm` on PATH.
 */
export function regenEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  return { ...env, API_COMPARE_FORCE: "1" };
}

export function regenerateArtifact(
  env: Record<string, string | undefined>,
  extraArgs: string[] = ["--calls"],
): Promise<void> {
  const args = ["parity:api", ...extraArgs];
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, {
      cwd: ROOT_DIR,
      env: regenEnv(env),
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`\`pnpm ${args.join(" ")}\` exited with ${signal ?? code}`));
    });
  });
}

/**
 * Whether `artifactPath` predates the sources it describes.
 *
 * The companion to the forced regeneration above, for the runs that skip it —
 * `--no-regen`, API_COMPARE_SKIP_REGEN=1, or CI. Those gate whatever is on
 * disk, and an artifact older than a compared source describes a tree that no
 * longer exists: its rows are neither reproducible nor falsifiable. mtimes are
 * the right oracle here for the same reason they are for the extraction
 * manifests — the artifact is only ever written by a local run that just read
 * those sources, never restored from an archive (see `manifestIsStale`).
 */
export function artifactIsStale(artifactPath: string): Promise<boolean> {
  return manifestIsStale(artifactPath, apiComparePackageRoots());
}

/** The operator-facing refusal text for a stale artifact. */
export function staleArtifactMessage(gate: string, artifactPath: string): string {
  return (
    `\n${gate}: REFUSING to gate — ${path.relative(ROOT_DIR, artifactPath)} predates ` +
    "the sources it describes.\n" +
    "Its rows would describe a tree that no longer exists: mismatches converged " +
    "since it was written still flag, and ones introduced since do not. Regenerate " +
    "and re-run:\n" +
    "  API_COMPARE_FORCE=1 pnpm parity:api --calls\n" +
    `Or drop ${NO_REGEN_FLAG}/${REGEN_SKIP_ENV} and let the gate regenerate it itself.\n`
  );
}
