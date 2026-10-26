import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { TZDATA_VERSION } from "../packages/date/src/tzdata-abbreviations.js";
import { zoneinfo } from "./tzdata-zoneinfo.js";

const execFileAsync = promisify(execFile);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENERATOR = path.join(REPO_ROOT, "scripts", "generate-tzdata-abbreviations.ts");
const TZDATA_ABBREVIATIONS = path.join(
  REPO_ROOT,
  "packages",
  "date",
  "src",
  "tzdata-abbreviations.ts",
);

/**
 * The generator needs `ruby` with the `tzinfo` gem, and `curl` / `zic` to build
 * the zoneinfo for Node's tzdata release; a runner without them skips.
 */
async function hasTzinfo(): Promise<boolean> {
  try {
    await execFileAsync("ruby", ["-e", 'require "tzinfo"']);
    await zoneinfo();
    return true;
  } catch {
    return false;
  }
}

describe("generate-tzdata-abbreviations", () => {
  // A Node upgrade moves its ICU to a new tzdata release; the table has to be
  // regenerated from that release, or the port reads two releases at once.
  it("was generated from the tzdata release Node carries", () => {
    expect(TZDATA_VERSION).toBe(process.versions.tz);
  });

  // A tzdata release that revises a zone's abbreviations silently changes what
  // `Time#zone` answers; regenerating the table here turns that into a red test.
  it("reproduces the committed tzdata-abbreviations.ts table", async (ctx) => {
    if (!(await hasTzinfo())) ctx.skip();

    const { stdout } = await execFileAsync("pnpm", ["tsx", GENERATOR], {
      cwd: REPO_ROOT,
      maxBuffer: 64 * 1024 * 1024,
    });

    expect(stdout.trim()).toBe((await readFile(TZDATA_ABBREVIATIONS, "utf8")).trim());
  }, 120_000);
});
