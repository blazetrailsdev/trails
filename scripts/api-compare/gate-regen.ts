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
import { ROOT_DIR } from "./config.js";

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
export function regenerateArtifact(
  env: Record<string, string | undefined>,
  extraArgs: string[] = ["--calls"],
): Promise<void> {
  const args = ["parity:api", ...extraArgs];
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd: ROOT_DIR, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`\`pnpm ${args.join(" ")}\` exited with ${signal ?? code}`));
    });
  });
}
