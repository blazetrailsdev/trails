import { describe, it, expect } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import { ROOT_DIR, changedFiles, exceedances, measure, measureAt } from "./eslint-count.js";

const run = promisify(execFile);

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

describe("activerecord", () => {
  const rel = "packages/activerecord/src/eslint-count-fixture.ts";
  const key = `${rel}::@typescript-eslint/no-explicit-any`;

  it("counts each no-explicit-any violation in a new file against a base of zero", async () => {
    const file = path.join(ROOT_DIR, rel);
    await fs.writeFile(file, "export const a: any = 1;\nexport const b = a as any;\n");
    try {
      expect(await changedFiles("HEAD")).toContain(rel);
      expect(await measureAt("HEAD", [rel])).toEqual({});
      expect(await measure([rel])).toEqual({ [key]: 2 });
    } finally {
      await fs.rm(file);
    }
  }, 60_000);

  it("reads the same counts at HEAD as in an unmodified working tree", async () => {
    const tracked = "packages/activerecord/src/base.ts";
    const { stdout } = await run("git", ["status", "--porcelain", tracked], { cwd: ROOT_DIR });
    if (stdout !== "") return;
    expect(await measureAt("HEAD", [tracked])).toEqual(await measure([tracked]));
  }, 60_000);
});
