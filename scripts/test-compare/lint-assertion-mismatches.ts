#!/usr/bin/env npx tsx
/**
 * CLI for the assertion-level only-shrink ratchet (RFC 0025).
 *
 * Reads the per-package assertion-count / kind / value mismatch totals out of
 * output/convention-comparison.json and gates them against the committed
 * high-water mark in assertion-mismatch-mark.json. See assertion-ratchet.ts for
 * the contract (aggregate, only-shrink, no second extractor).
 *
 * Usage:
 *   pnpm test:assertions:ratchet            # gate (regenerates the artifact first)
 *   pnpm test:assertions:ratchet:reseed     # lower the mark after convergence
 *   pnpm tsx scripts/test-compare/lint-assertion-mismatches.ts --no-regen
 *
 * A plain run regenerates the artifact itself by shelling out to
 * `pnpm test:compare --json` — gating a STALE convention-comparison.json is the
 * trap this mirrors from `api:calls:wide`: a file written before a sibling PR's
 * tests landed reports movement that never happened, and `--write` would commit
 * that fiction as the new mark. Opt out with `--no-regen`,
 * TEST_COMPARE_SKIP_REGEN=1, or any CI value — CI writes the artifact in its own
 * test-comparison step and must not pay for the extraction twice.
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
  renderShrunk,
  renderUnmarked,
  renderWriteSummary,
  shrunk,
  violations,
  writeMark,
} from "./assertion-ratchet.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const ARTIFACT_PATH = path.join(SCRIPT_DIR, "output", "convention-comparison.json");
const MARK_PATH = path.join(SCRIPT_DIR, "assertion-mismatch-mark.json");
const MARK_REL = path.relative(ROOT_DIR, MARK_PATH);

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

async function loadArtifact(): Promise<ComparisonArtifact> {
  let text: string;
  try {
    text = await fs.readFile(ARTIFACT_PATH, "utf-8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    throw new Error(
      `Missing ${path.relative(ROOT_DIR, ARTIFACT_PATH)} — run \`pnpm test:compare --json\` ` +
        "first to write it.",
      { cause: e },
    );
  }
  return JSON.parse(text) as ComparisonArtifact;
}

export async function main(write: boolean): Promise<number> {
  const current = countsFromArtifact(await loadArtifact());
  const mark = await loadMark(MARK_PATH);

  // A marked package that vanished means the artifact was written by a
  // partial-scope run; reseeding from it would drop that package's mark
  // entirely. Fail before either arm touches the file.
  const missing = missingFromArtifact(current, mark);
  if (missing.length > 0) {
    console.error(renderMissing(missing, MARK_REL));
    return 1;
  }

  if (write) {
    const next = nextMark(current, mark);
    await writeMark(MARK_PATH, next);
    console.log(renderWriteSummary(next, MARK_REL));
    return 0;
  }

  const { exceeded, unmarked } = violations(current, mark);
  if (unmarked.length > 0) console.error(renderUnmarked(unmarked, MARK_REL));
  if (exceeded.length > 0) console.error(renderExceeded(exceeded, MARK_REL));
  if (exceeded.length > 0 || unmarked.length > 0) return 1;

  const under = shrunk(current, mark);
  if (under.length > 0) console.log(renderShrunk(under, MARK_REL));
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
