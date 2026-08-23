import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { tzdataIsdst } from "../packages/date/src/tzdata-isdst.js";

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

/**
 * `Time#isdst` per zone at the nine dates the story names: year-round war time
 * (1943, 1974), the year before and after each permanent standard-offset shift
 * (2015, 2016, 2020, 2022), an ordinary northern winter and summer (2024), and
 * one pre-tzdata-1970s reading.
 */
const MRI_GRID_SCRIPT = `
require "json"
zones = JSON.parse(ARGV[0])
dates = [[1943,6,15],[1974,2,1],[2015,7,1],[2016,7,1],[2022,7,1],[2020,7,1],[2024,1,15],[2024,7,15],[1970,7,1]]
out = []
zones.each do |zone|
  ENV["TZ"] = zone
  dates.each do |(year, month, day)|
    at = Time.utc(year, month, day, 12).to_i
    out << [zone, at, Time.at(at).isdst]
  end
end
puts JSON.generate(out)
`;

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

  // The story's acceptance criterion: the full MRI grid — every zone the
  // runtime knows, at each of the nine dates that separate the readings —
  // answers what `tzdataIsdst` answers. MRI honours `ENV["TZ"]` per call, so
  // one `ruby` process produces the whole grid, and `Time#isdst` there is
  // `tm.tm_isdst` off the zoneinfo file (`ruby/time.c` `time_isdst`) — the
  // same bit TZInfo hands `ActiveSupport::TimeZone#dst?` (time_zone.rb:571)
  // and `TimeWithZone#dst?` (time_with_zone.rb:94).
  it("answers what MRI's Time#isdst answers for every zone at nine dates", async (ctx) => {
    if (!(await hasTzinfo())) ctx.skip();

    const identifiers = Intl.supportedValuesOf("timeZone");
    const { stdout } = await execFileAsync(
      "ruby",
      ["-e", MRI_GRID_SCRIPT, JSON.stringify(identifiers)],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    const samples = JSON.parse(stdout) as [string, number, boolean][];

    const mismatches = samples.filter(([zone, at, isdst]) => tzdataIsdst(zone, at) !== isdst);
    expect(mismatches).toEqual([]);
    expect(samples.length).toBe(identifiers.length * 9);
  }, 120_000);
});
