#!/usr/bin/env npx tsx
/**
 * CLI for the assertion-level only-shrink ratchet (RFC 0025). Reads the
 * per-package assertion-count / kind / value totals out of
 * output/convention-comparison.json and gates them against the same artifact as
 * main's CI wrote it for the base commit (RFC 0127, scripts/parity/main-artifact.ts);
 * see assertion-ratchet.ts for the contract.
 *
 * Usage:
 *   pnpm parity:test:assertions            # gate (regenerates the artifact first)
 *   pnpm tsx scripts/test-compare/lint-assertion-mismatches.ts --no-regen
 *
 * A plain run regenerates the artifact via `pnpm parity:test --json`: gating a
 * STALE convention-comparison.json reports movement that never happened. Opt
 * out with `--no-regen`, TEST_COMPARE_SKIP_REGEN=1, or any CI value — CI writes
 * the artifact in its own test-comparison step and must not pay for it twice.
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
  missingFromArtifact,
  renderExceeded,
  renderMissing,
  renderUnmarked,
  violations,
} from "./assertion-ratchet.js";
import { baseOutputs } from "../parity/main-artifact.js";
import { scopeMismatch, scopeOf, scopedMarks } from "../api-compare/scope.js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "../..");
const ARTIFACT_PATH = path.join(SCRIPT_DIR, "output", "convention-comparison.json");

export const NO_REGEN_FLAG = "--no-regen";
export const REGEN_SKIP_ENV = "TEST_COMPARE_SKIP_REGEN";

export function shouldRegenerate(argv: string[], env: Record<string, string | undefined>): boolean {
  if (argv.includes(NO_REGEN_FLAG)) return false;
  return !env.CI && env[REGEN_SKIP_ENV] !== "1";
}

export function regenerateArtifact(env: Record<string, string | undefined>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn("pnpm", ["parity:test", "--json"], {
      cwd: ROOT_DIR,
      env,
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`\`pnpm parity:test --json\` exited with ${signal ?? code}`));
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
      `Missing ${path.relative(ROOT_DIR, file)} — run \`pnpm parity:test --json\` first to ` +
        "write it.",
      { cause: e },
    );
  }
  return JSON.parse(text) as ComparisonArtifact;
}

/** The artifact pair the gate compares; overridable so tests can drive `main`. */
export interface Paths {
  artifact: string;
  base: string;
}

/**
 * Gate the artifact on disk against the base's. Returns the exit code.
 *
 * A base package missing from the artifact means a partial-scope run, so the
 * gate bails on it rather than reporting the package as converged.
 */
export async function main(paths: Paths, scope: string | null = null): Promise<number> {
  const baseRel = `${path.basename(paths.base)} at the base`;
  const current = countsFromArtifact(await loadArtifact(paths.artifact));
  if (scope !== null) {
    const mismatch = scopeMismatch("assertion-mismatch ratchet", Object.keys(current), scope);
    if (mismatch !== null) {
      console.error(mismatch);
      return 1;
    }
  }
  const base = scopedMarks(countsFromArtifact(await loadArtifact(paths.base)), scope);

  const missing = missingFromArtifact(current, base);
  if (missing.length > 0) {
    console.error(renderMissing(missing, baseRel));
    return 1;
  }

  const { exceeded, unmarked } = violations(current, base);
  if (unmarked.length > 0) console.error(renderUnmarked(unmarked, baseRel));
  if (exceeded.length > 0) console.error(renderExceeded(exceeded, baseRel));
  if (exceeded.length > 0 || unmarked.length > 0) return 1;

  console.log("assertion-mismatch ratchet: OK (no counter exceeds its base count).");
  return 0;
}

async function runAsScript(): Promise<void> {
  const self = fileURLToPath(import.meta.url);
  const invoked = process.argv[1] ? path.resolve(process.argv[1]) : "";
  if (path.resolve(self) !== invoked) return;
  const argv = process.argv.slice(2);
  try {
    if (shouldRegenerate(argv, process.env)) {
      console.log("Regenerating output/convention-comparison.json (parity:test --json)…");
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
    const scope = scopeOf(argv);
    const base = await baseOutputs(["pnpm", "parity:test", "--json"], ROOT_DIR, process.env);
    let code: number;
    try {
      console.log(`assertion-mismatch ratchet: comparing against ${base.sha}.`);
      code = await main(
        {
          artifact: ARTIFACT_PATH,
          base: path.join(base.dir, path.relative(ROOT_DIR, ARTIFACT_PATH)),
        },
        scope,
      );
    } finally {
      await base.dispose();
    }
    process.exit(code);
  } catch (e) {
    console.error(`\nassertion-mismatch ratchet: ${(e as Error).message}\n`);
    process.exit(2);
  }
}

void runAsScript();
