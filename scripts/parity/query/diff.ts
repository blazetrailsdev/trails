/**
 * Usage: tsx scripts/parity/query/diff.ts --rails-dir <dir> --trails-dir <dir>
 *
 * Loads every *.json file in both dirs, validates each against
 * scripts/parity/canonical/query.schema.json, diffs rails vs trails per
 * fixture, and prints per-fixture PASS/FAIL/KNOWN-GAP with a unified diff
 * on unexpected failures.
 *
 * Known-gap handling:
 *   - scripts/parity/canonical/query-known-gaps.json lists fixtures where
 *     Rails and trails currently diverge, with a reason and expected side.
 *   - Listed fixtures that fail print "KNOWN-GAP" (not a failure).
 *   - Listed fixtures that unexpectedly PASS (parity closed) print
 *     "UNEXPECTED-PASS" and fail the run — prompts removing from the list.
 *   - Unlisted fixtures that fail print "FAIL" and fail the run.
 *
 * D7 (mirrors schema/diff.ts): always runs all fixtures — never fail-fast.
 *
 * Must be run from the repo root.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import Ajv from "ajv/dist/2020.js";
import { createTwoFilesPatch } from "diff";
import { stableJson } from "../canonical/diff-helpers.js";

const SCHEMA_PATH = "scripts/parity/canonical/query.schema.json";
// Tests override via PARITY_KNOWN_GAPS_PATH / PARITY_FIXTURES_DIR so they don't
// clobber the committed list or require the real fixtures dir.
const KNOWN_GAPS_PATH =
  process.env.PARITY_KNOWN_GAPS_PATH || "scripts/parity/canonical/query-known-gaps.json";
const FIXTURES_DIR = process.env.PARITY_FIXTURES_DIR || "scripts/parity/fixtures";
// Pre-includes the v2 "ar-" AR-style prefix so widening the orchestrator's
// matcher (scripts/parity/run.ts) doesn't silently un-classify new fixtures.
// Numeric-prefixed dirs are schema fixtures and are deliberately excluded.
const FIXTURE_PATTERN = /^(arel|ar)-/;

interface KnownGap {
  /** Human-readable explanation and (if applicable) tracking link. */
  reason: string;
  /**
   * Shape of the gap, from the parity-run's point of view:
   *   - "rails-missing" — rails runner failed (no json), trails succeeded
   *   - "trails-missing" — trails runner failed (no json), rails succeeded
   *   - "both-missing" — neither runner produced output
   *   - "diff" — both produced output but SQL strings differ
   */
  side: "rails-missing" | "trails-missing" | "both-missing" | "diff";
}

type KnownGaps = Record<string, KnownGap>;

const VALID_SIDES: ReadonlySet<KnownGap["side"]> = new Set([
  "rails-missing",
  "trails-missing",
  "both-missing",
  "diff",
]);

/**
 * Validate the shape of the known-gaps file so a typo in a `side` value or
 * a missing `reason` fails loudly instead of silently mis-classifying fixtures.
 * Returns a typed object on success; exits 1 with a useful error on failure.
 */
function loadKnownGaps(path: string): KnownGaps {
  if (!existsSync(path)) return {};
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    process.stderr.write(
      `parity query diff: failed to parse ${path}: ${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    process.stderr.write(`parity query diff: ${path} must be a JSON object\n`);
    process.exit(1);
  }
  const gaps: KnownGaps = {};
  for (const [name, entry] of Object.entries(raw as Record<string, unknown>)) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      process.stderr.write(`parity query diff: ${path}[${name}] must be an object\n`);
      process.exit(1);
    }
    const e = entry as Record<string, unknown>;
    if (typeof e.side !== "string" || !VALID_SIDES.has(e.side as KnownGap["side"])) {
      process.stderr.write(
        `parity query diff: ${path}[${name}].side must be one of ${[...VALID_SIDES].join(", ")} (got ${JSON.stringify(e.side)})\n`,
      );
      process.exit(1);
    }
    if (typeof e.reason !== "string" || e.reason.trim() === "") {
      process.stderr.write(
        `parity query diff: ${path}[${name}].reason must be a non-empty string\n`,
      );
      process.exit(1);
    }
    gaps[name] = { side: e.side as KnownGap["side"], reason: e.reason };
  }
  return gaps;
}

function assertRepoRoot(): void {
  if (!existsSync(SCHEMA_PATH)) {
    process.stderr.write(
      `parity query diff: must be run from repo root (${SCHEMA_PATH} not found)\n`,
    );
    process.exit(1);
  }
}

function usage(): never {
  process.stderr.write(
    "Usage: tsx scripts/parity/query/diff.ts --rails-dir <dir> --trails-dir <dir>\n",
  );
  process.exit(1);
}

function parseArgs(): { railsDir: string; trailsDir: string } {
  const args = process.argv.slice(2);
  let railsDir: string | undefined;
  let trailsDir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--rails-dir") railsDir = args[++i];
    else if (args[i] === "--trails-dir") trailsDir = args[++i];
  }
  if (!railsDir || !trailsDir) usage();
  return { railsDir, trailsDir };
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    process.stderr.write(`parity query diff: directory not found: ${dir}\n`);
    process.exit(1);
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort();
}

async function main(): Promise<void> {
  assertRepoRoot();
  const { railsDir, trailsDir } = parseArgs();

  const schemaJson = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  const ajv = new Ajv();
  const validate = ajv.compile(schemaJson);

  const knownGaps = loadKnownGaps(KNOWN_GAPS_PATH);

  const railsFiles = new Set(listJsonFiles(railsDir));
  const trailsFiles = new Set(listJsonFiles(trailsDir));
  const allFixtures = new Set<string>();
  // Seed from the fixture directory so a fixture that failed on BOTH sides
  // (and so has no JSON in either output dir) is still classified. Without
  // this, an unlisted both-fail fixture would be silently skipped and the
  // diff would exit 0.
  if (existsSync(FIXTURES_DIR)) {
    for (const e of readdirSync(FIXTURES_DIR, { withFileTypes: true })) {
      if (e.isDirectory() && FIXTURE_PATTERN.test(e.name)) allFixtures.add(e.name);
    }
  }
  for (const f of railsFiles) allFixtures.add(basename(f, ".json"));
  for (const f of trailsFiles) allFixtures.add(basename(f, ".json"));
  // Known gaps may reference fixtures that have been removed from the fixture
  // tree — still classify them so the list itself stays honest.
  for (const name of Object.keys(knownGaps)) allFixtures.add(name);

  if (allFixtures.size === 0) {
    process.stderr.write("parity query diff: no fixtures found\n");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  let knownGap = 0;
  let unexpectedPass = 0;
  const gapBySide: Record<KnownGap["side"], number> = {
    "rails-missing": 0,
    "trails-missing": 0,
    "both-missing": 0,
    diff: 0,
  };

  for (const name of [...allFixtures].sort()) {
    const file = `${name}.json`;
    const gap = knownGaps[name];
    const hasRails = railsFiles.has(file);
    const hasTrails = trailsFiles.has(file);

    // --- Asymmetric (one side or both missing) ---
    if (!hasRails || !hasTrails) {
      const actualSide: KnownGap["side"] =
        !hasRails && !hasTrails ? "both-missing" : !hasRails ? "rails-missing" : "trails-missing";
      if (gap && gap.side === actualSide) {
        process.stdout.write(`KNOWN-GAP  ${name}  (${actualSide}: ${gap.reason})\n`);
        knownGap++;
        gapBySide[actualSide]++;
      } else if (gap) {
        failed++;
        process.stdout.write(
          `FAIL  ${name}  (expected ${gap.side}, actual ${actualSide}: ${gap.reason})\n`,
        );
      } else {
        failed++;
        process.stdout.write(`FAIL  ${name}  (${actualSide} — not in known-gaps)\n`);
      }
      continue;
    }

    // --- Both sides produced output: validate then compare ---
    try {
      const railsRaw = JSON.parse(readFileSync(join(railsDir, file), "utf8"));
      const trailsRaw = JSON.parse(readFileSync(join(trailsDir, file), "utf8"));

      let schemaFailed = false;
      for (const [label, doc] of [
        ["rails", railsRaw],
        ["trails", trailsRaw],
      ] as const) {
        if (!validate(doc)) {
          process.stdout.write(`FAIL  ${name}  (${label} output fails schema validation)\n`);
          process.stdout.write(`      ${ajv.errorsText(validate.errors)}\n`);
          schemaFailed = true;
        }
      }
      if (schemaFailed) {
        failed++;
        continue;
      }

      const railsNorm = stableJson(railsRaw);
      const trailsNorm = stableJson(trailsRaw);

      if (railsNorm === trailsNorm) {
        if (gap) {
          // Gap has closed — ask the operator to remove it.
          unexpectedPass++;
          process.stdout.write(
            `UNEXPECTED-PASS  ${name}  (parity closed; remove from ${KNOWN_GAPS_PATH})\n`,
          );
        } else {
          passed++;
          process.stdout.write(`PASS  ${name}\n`);
        }
      } else {
        if (gap && gap.side === "diff") {
          knownGap++;
          gapBySide.diff++;
          process.stdout.write(`KNOWN-GAP  ${name}  (diff: ${gap.reason})\n`);
        } else {
          failed++;
          if (gap) {
            process.stdout.write(
              `FAIL  ${name}  (expected ${gap.side}, actual diff: ${gap.reason})\n`,
            );
          } else {
            // "output differs" not "SQL differs" — the diff compares the whole
            // CanonicalQuery JSON (sql + binds + frozenAt), not just sql.
            process.stdout.write(`FAIL  ${name}  (output differs — not in known-gaps)\n`);
          }
          const patch = createTwoFilesPatch(
            `rails/${file}`,
            `trails/${file}`,
            railsNorm,
            trailsNorm,
            "",
            "",
            { context: 4 },
          );
          process.stdout.write(patch);
        }
      }
    } catch (err: unknown) {
      failed++;
      process.stdout.write(
        `FAIL  ${name}  (${err instanceof Error ? err.message : String(err)})\n`,
      );
    }
  }

  const total = allFixtures.size;
  process.stdout.write(`\n${passed}/${total} passed, ${knownGap} known gap(s)`);
  if (unexpectedPass > 0) process.stdout.write(`, ${unexpectedPass} unexpected pass`);
  if (failed > 0) process.stdout.write(`, ${failed} failure(s)`);
  process.stdout.write("\n");

  if (knownGap > 0) {
    const parts = (Object.entries(gapBySide) as [KnownGap["side"], number][])
      .filter(([, n]) => n > 0)
      .map(([side, n]) => `${n} ${side}`);
    process.stdout.write(`  known gaps by side: ${parts.join(", ")}\n`);
  }

  if (failed > 0 || unexpectedPass > 0) process.exit(1);
}

main().catch((err: unknown) => {
  process.stderr.write(`parity query diff: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
