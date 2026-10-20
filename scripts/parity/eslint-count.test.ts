import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { ROOT_DIR, exceedances, main, measure, measureAt } from "./eslint-count.js";

const run = promisify(execFile);
const ANY = "@typescript-eslint/no-explicit-any";
const STRIPPED = "packages/activerecord/src/associations.ts";
const MOVED = "packages/activerecord/src/aggregations.ts";
const MOVED_TO = "packages/activerecord/src/aggregations-moved.ts";

describe("exceedances", () => {
  it("flags a file above its base count and a file new at a non-zero count", () => {
    expect(exceedances({ "a.ts::r": 2 }, { "a.ts::r": 3, "b.ts::r": 1 })).toEqual([
      { key: "a.ts::r", base: 2, current: 3 },
      { key: "b.ts::r", base: 0, current: 1 },
    ]);
  });

  it("passes a file at or below its base count", () => {
    expect(exceedances({ "a.ts::r": 2, "c.ts::r": 1 }, { "a.ts::r": 1 })).toEqual([]);
  });
});

describe("main", () => {
  let dir: string;
  let base: string;

  beforeAll(async () => {
    dir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "eslint-count-")), "wt");
    const git = (cwd: string, ...args: string[]) => run("git", args, { cwd });
    await git(ROOT_DIR, "worktree", "add", "-q", "--detach", dir, "HEAD");
    const stripped = path.join(dir, STRIPPED);
    await fs.writeFile(
      stripped,
      (await fs.readFile(stripped, "utf-8")).replace(/: any\b/g, ": unknown"),
    );
    await git(dir, "mv", MOVED, MOVED_TO);
    await git(dir, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qam", "base");
    base = (await git(dir, "rev-parse", "HEAD")).stdout.trim();
  }, 60_000);

  afterAll(async () => {
    await run("git", ["worktree", "remove", "--force", dir], { cwd: ROOT_DIR });
    await fs.rm(path.dirname(dir), { recursive: true, force: true });
  });

  it("reads a file's base version, and 0 where its path is absent at the base", async () => {
    const atBase = await measureAt(base, [STRIPPED, MOVED]);
    const current = await measure([STRIPPED]);
    expect(atBase[`${STRIPPED}::${ANY}`]).toBeLessThan(current[`${STRIPPED}::${ANY}`]);
    expect(atBase[`${MOVED}::${ANY}`]).toBeUndefined();
  }, 60_000);

  it("reds a file above its base count and a moved file whose base path is gone", async () => {
    const current = await measure([STRIPPED, MOVED]);
    const atBase = await measureAt(base, [STRIPPED]);
    const error = await main(base).then(
      () => null,
      (e: Error) => e,
    );
    expect(error?.message).toContain(
      `${STRIPPED}::${ANY}: ${atBase[`${STRIPPED}::${ANY}`]} → ${current[`${STRIPPED}::${ANY}`]}`,
    );
    expect(error?.message).toContain(`${MOVED}::${ANY}: 0 → ${current[`${MOVED}::${ANY}`]}`);
  }, 120_000);

  it("passes when the base is HEAD itself", async () => {
    const { stdout } = await run("git", ["status", "--porcelain", "packages"], { cwd: ROOT_DIR });
    if (stdout !== "") return;
    await expect(main("HEAD")).resolves.toMatch(/OK \(0 changed/);
  }, 60_000);
});
