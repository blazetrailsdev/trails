/**
 * Usage: tsx scripts/parity/schema/diff.ts --rails-dir <dir> --trails-dir <dir>
 *
 * Loads every *.json file present in both dirs, validates each against the
 * canonical JSON Schema, diffs rails vs trails per fixture, prints per-fixture
 * PASS/FAIL with unified diff on failure, and exits 1 if any fixture failed.
 *
 * D7: always runs all fixtures — never fail-fast.
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import Ajv from "ajv/dist/2020.js";
import { createTwoFilesPatch } from "diff";

const SCHEMA_PATH = "scripts/parity/canonical/schema.schema.json";

function assertRepoRoot(): void {
  if (!existsSync(SCHEMA_PATH)) {
    process.stderr.write(`parity diff: must be run from repo root (${SCHEMA_PATH} not found)\n`);
    process.exit(1);
  }
}

function usage(): never {
  process.stderr.write(
    "Usage: tsx scripts/parity/schema/diff.ts --rails-dir <dir> --trails-dir <dir>\n",
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

function sortedKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortedKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj)
        .sort()
        .map((k) => [k, sortedKeys((obj as Record<string, unknown>)[k])]),
    );
  }
  return obj;
}

function stableJson(obj: unknown): string {
  return JSON.stringify(sortedKeys(obj), null, 2) + "\n";
}

function listJsonFiles(dir: string): string[] {
  if (!existsSync(dir)) {
    process.stderr.write(`parity diff: directory not found: ${dir}\n`);
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

  const railsFiles = new Set(listJsonFiles(railsDir));
  const trailsFiles = new Set(listJsonFiles(trailsDir));

  if (railsFiles.size + trailsFiles.size === 0) {
    process.stderr.write("parity diff: no fixture JSON files found in either dir\n");
    process.exit(1);
  }

  const onlyRails = [...railsFiles].filter((f) => !trailsFiles.has(f));
  const onlyTrails = [...trailsFiles].filter((f) => !railsFiles.has(f));
  const fixtures = [...railsFiles].filter((f) => trailsFiles.has(f)).sort();
  // Asymmetric fixtures are a failure — parity is unverified for them.
  // Still proceed to diff the shared set (D7: never fail-fast).
  let failedFixtures = onlyRails.length + onlyTrails.length;
  for (const f of onlyRails)
    process.stdout.write(`FAIL  ${basename(f, ".json")}  (missing from trails output)\n`);
  for (const f of onlyTrails)
    process.stdout.write(`FAIL  ${basename(f, ".json")}  (missing from rails output)\n`);

  for (const file of fixtures) {
    const name = basename(file, ".json");
    try {
      const railsRaw = JSON.parse(readFileSync(join(railsDir, file), "utf8"));
      const trailsRaw = JSON.parse(readFileSync(join(trailsDir, file), "utf8"));

      // Validate both against canonical schema before diffing.
      // Count at fixture level (not document level) so summary is accurate.
      let fixtureFailed = false;
      for (const [label, doc] of [
        ["rails", railsRaw],
        ["trails", trailsRaw],
      ] as const) {
        if (!validate(doc)) {
          process.stdout.write(`FAIL  ${name}  (${label} output fails schema validation)\n`);
          process.stdout.write(`      ${ajv.errorsText(validate.errors)}\n`);
          fixtureFailed = true;
        }
      }
      if (fixtureFailed) {
        failedFixtures++;
        continue;
      }

      // Stable JSON normalisation then line diff
      const railsNorm = stableJson(railsRaw);
      const trailsNorm = stableJson(trailsRaw);

      if (railsNorm === trailsNorm) {
        process.stdout.write(`PASS  ${name}\n`);
      } else {
        failedFixtures++;
        process.stdout.write(`FAIL  ${name}\n`);
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
    } catch (err: unknown) {
      failedFixtures++;
      process.stdout.write(
        `FAIL  ${name}  (${err instanceof Error ? err.message : String(err)})\n`,
      );
    }
  }

  const totalFixtures = fixtures.length + onlyRails.length + onlyTrails.length;
  process.stdout.write(`\n${totalFixtures - failedFixtures}/${totalFixtures} fixtures passed\n`);
  if (failedFixtures > 0) process.exit(1);
}

main().catch((err: unknown) => {
  process.stderr.write(`parity diff: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
