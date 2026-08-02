/**
 * Shared pre-gate artifact regeneration for the call-mismatch ratchets
 * (RFC 0083).
 *
 * Both the narrow (`lint-call-mismatches.ts`) and wide
 * (`lint-call-mismatches-wide.ts`) gates read an artifact `compare.ts` wrote.
 * Gating whatever is on disk is what makes a sibling PR's deleted TS method
 * surface as `STALE baseline entr(ies)` on a branch that never touched it, and
 * the fix was always "re-extract, then re-run" — so a local run does the
 * re-extraction itself. Regeneration goes through run.sh (`pnpm api:compare`)
 * rather than compare.ts so the extraction manifests compare.ts reads are
 * refreshed first.
 *
 * One opt-out contract serves both gates: `--no-regen`,
 * API_COMPARE_SKIP_WIDE_REGEN=1, or any CI value — CI runs the extraction step
 * separately and must not pay for it twice.
 *
 * Hard rules: no node:* imports, no process.* (callers pass their own env),
 * async only.
 */

import { spawn } from "child_process";
import { ROOT_DIR } from "./config.js";

export const NO_REGEN_FLAG = "--no-regen";

export const REGEN_SKIP_ARGS = [NO_REGEN_FLAG, "--report", "--unreviewed"];

export const REGEN_SKIP_ENV = "API_COMPARE_SKIP_WIDE_REGEN";

// A reseed regenerating a stale artifact is the same bug this closes, one
// severity worse: `--write` commits the stale population as the new baseline.
// So `--write` regenerates too — except under API_COMPARE_FORCE, which is the
// api:calls:reseed / api:calls:wide:reseed scripts' own marker that they just
// ran the (forced) regeneration themselves.
export function shouldRegenerate(argv: string[], env: Record<string, string | undefined>): boolean {
  if (argv.some((a) => REGEN_SKIP_ARGS.includes(a))) return false;
  if (argv.includes("--write") && env.API_COMPARE_FORCE) return false;
  return !env.CI && env[REGEN_SKIP_ENV] !== "1";
}

// `extraArgs` is the compare scope: [] for the narrow artifact,
// ["--wide-calls"] for the wide one.
export function regenerateArtifact(
  env: Record<string, string | undefined>,
  extraArgs: string[] = [],
): Promise<void> {
  const args = ["api:compare", ...extraArgs];
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", args, { cwd: ROOT_DIR, env, stdio: "inherit" });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`\`pnpm ${args.join(" ")}\` exited with ${signal ?? code}`));
    });
  });
}
