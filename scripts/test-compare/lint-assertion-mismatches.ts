#!/usr/bin/env npx tsx
/**
 * CLI for the assertion-level only-shrink ratchet (RFC 0025). Reads the
 * per-package assertion-count / kind / value totals out of
 * output/convention-comparison.json and gates them against the mark in
 * assertion-mismatch-mark.json; see assertion-ratchet.ts for the contract.
 *
 * Usage:
 *   pnpm test:assertions:ratchet            # gate (regenerates the artifact first)
 *   pnpm test:assertions:ratchet:reseed     # lower the mark after convergence
 *   pnpm tsx scripts/test-compare/lint-assertion-mismatches.ts --no-regen
 *
 * A plain run regenerates the artifact via `pnpm test:compare --json`: gating a
 * STALE convention-comparison.json reports movement that never happened, and
 * `--write` would commit that fiction as the new mark. Opt out with
 * `--no-regen`, TEST_COMPARE_SKIP_REGEN=1, or any CI value — CI writes the
 * artifact in its own test-comparison step and must not pay for it twice.
 *
 * Hard rules: no node:* imports, no process.* outside the CLI entry guard,
 * async fs.
 */
import { spawn } from "child_process";
import * as fs from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import {
  type ComparisonArtifact,
  countsFromArtifact,
  loadMark,
  missingFromArtifact,
  nextMark,
  renderExceeded,
  renderMissing,
  renderUnmarked,
  renderWriteSummary,
  violations,
  writeMark,
} from "./assertion-ratchet.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const ARTIFACT_PATH = path.join(SCRIPT_DIR, "output", "convention-comparison.json");
const MARK_PATH = path.join(SCRIPT_DIR, "assertion-mismatch-mark.json");

export const NO_REGEN_FLAG = "--no-regen";
export const REGEN_SKIP_ENV = "TEST_COMPARE_SKIP_REGEN";

export function shouldRegenerate(argv: string[], env: Record<string, string | undefined>): boolean {
  if (argv.includes(NO_REGEN_FLAG)) return false;
  return !env.CI && env[REGEN_SKIP_ENV] !== "1";
}

export function regenerateArtifact(env: Record<string, string | undefined>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["test:compare", "--json"], {
      cwd: ROOT_DIR,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`\`pnpm test:compare --json\` exited with ${signal ?? code}`));
    });
  });
}

async function loadArtifact(file: string): Promise<ComparisonArtifact> {
  let text: string;
  try {
    text = await fs.readFile(file, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, file)} — run \`pnpm test:compare --json\` first to ` +
        "write it.",
      { cause: e },
    );
  }
  return JSON.parse(text) as ComparisonArtifact;
}

/** File pair the gate reads/writes; overridable so tests can drive `main`. */
export interface Paths {
  artifact: string;
  mark: string;
}

export const DEFAULT_PATHS: Paths = { artifact: ARTIFACT_PATH, mark: MARK_PATH };

/**
 * Gate (or, under `write`, reseed) the mark against the artifact on disk.
 * Returns the exit code.
 *
 * A marked package missing from the artifact means a partial-scope run, and
 * reseeding from one would drop that package's mark entirely — so both arms
 * bail on it before either touches the file.
 */
export async function main(write: boolean, paths: Paths = DEFAULT_PATHS): Promise<number> {
  const markRel = path.relative(ROOT_DIR, paths.mark);
  const current = countsFromArtifact(await loadArtifact(paths.artifact));
  const mark = await loadMark(paths.mark);

  const missing = missingFromArtifact(current, mark);
  if (missing.length > 0) {
    console.error(renderMissing(missing, markRel));
    return 1;
  }

  if (write) {
    const next = nextMark(current, mark);
    await writeMark(paths.mark, next);
    console.log(renderWriteSummary(next, markRel));
    return 0;
  }

  const { exceeded, unmarked } = violations(current, mark);
  if (unmarked.length > 0) console.error(renderUnmarked(unmarked, markRel));
  if (exceeded.length > 0) console.error(renderExceeded(exceeded, markRel));
  if (exceeded.length > 0 || unmarked.length > 0) return 1;

  console.log("assertion-mismatch ratchet: OK (no counter exceeds its high-water mark).");
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const argv = process.argv.slice(2);
  if (shouldRegenerate(argv, process.env)) {
    console.log("Regenerating output/convention-comparison.json (test:compare --json)…");
    try {
      await regenerateArtifact(process.env);
    } catch (e) {
      console.error(
        `\nassertion-mismatch ratchet: could not regenerate the artifact: ${(e as Error).message}\n` +
          `Re-run with ${NO_REGEN_FLAG} to gate against the artifact already on disk.\n`,
      );
      process.exit(2);
    }
  }
  try {
    process.exit(await main(argv.includes("--write")));
  } catch (e) {
    console.error(`\nassertion-mismatch ratchet: ${(e as Error).message}\n`);
    process.exit(2);
  }
}

void runAsScript();
