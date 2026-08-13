import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-canonical-zone-identifiers.ts");
const TIME_ZONE = path.join(
  REPO_ROOT,
  "packages",
  "activesupport",
  "src",
  "values",
  "time-zone.ts",
);

/** The generator needs `ruby` with the `tzinfo` gem; a runner without them skips. */
async function hasTzinfo(): Promise<boolean> {
  try {
    await execFileAsync("ruby", ["-e", 'require "tzinfo"']);
    return true;
  } catch {
    return false;
  }
}

/** The `CANONICAL_ZONE_IDENTIFIERS` literal as time-zone.ts carries it today. */
async function committedTable(): Promise<string> {
  const source = await readFile(TIME_ZONE, "utf8");
  const match = /const CANONICAL_ZONE_IDENTIFIERS: Record<string, string> = \{[\s\S]*?\n\};/.exec(
    source,
  );
  expect(match, "CANONICAL_ZONE_IDENTIFIERS is no longer a plain object literal").not.toBeNull();
  return match![0];
}

describe("generate-canonical-zone-identifiers", () => {
  // CANONICAL_ZONE_IDENTIFIERS stands in for the canonicalization
  // `TZInfo::Country#zone_identifiers` does for free (time_zone.rb:275), so a
  // tzdata release that retires a zone into a link — or an ICU release that
  // starts canonicalizing on its own — silently changes what `countryZones`
  // answers. Regenerating the table here turns that into a red test and a
  // reviewable diff.
  it("reproduces the committed CANONICAL_ZONE_IDENTIFIERS table", async (ctx) => {
    if (!(await hasTzinfo())) ctx.skip();

    const { stdout } = await execFileAsync("pnpm", ["tsx", GENERATOR], {
      cwd: REPO_ROOT,
      maxBuffer: 32 * 1024 * 1024,
    });

    expect(stdout.trim()).toBe(await committedTable());
  }, 120_000);
});
