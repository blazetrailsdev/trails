import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-tzdata-isdst.ts");
const TZDATA_ISDST = path.join(REPO_ROOT, "packages", "date", "src", "tzdata-isdst.ts");

/** The generator needs `ruby` with the `tzinfo` gem; a runner without them skips. */
async function hasTzinfo(): Promise<boolean> {
  try {
    await execFileAsync("ruby", ["-e", 'require "tzinfo"']);
    return true;
  } catch {
    return false;
  }
}

describe("generate-tzdata-isdst", () => {
  // TZDATA_ISDST carries the `isdst` bit MRI reads off the zoneinfo file, so a
  // tzdata release that revises a zone's transition history — a retroactive
  // correction, a newly-announced permanent shift — silently changes what
  // `Time#isdst`, `Time#zone` and `TimeZone#isDst` answer. Regenerating the
  // table here turns that into a red test and a reviewable diff.
  it("reproduces the committed tzdata-isdst.ts table", async (ctx) => {
    if (!(await hasTzinfo())) ctx.skip();

    const { stdout } = await execFileAsync("pnpm", ["tsx", GENERATOR], {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });

    expect(stdout.trim()).toBe((await readFile(TZDATA_ISDST, "utf8")).trim());
  }, 120_000);
});
