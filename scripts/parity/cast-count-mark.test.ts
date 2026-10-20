import { describe, it, expect } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  ROOT_DIR,
  countLines,
  exceedances,
  main,
  measure,
  staleMarks,
  tightened,
  total,
} from "./cast-count-mark.js";

describe("countLines", () => {
  it("counts matching lines, not matches", () => {
    expect(countLines("const a = b as any as unknown as C;\nfunction f(this: any) {}\nok\n")).toBe(
      2,
    );
    expect(countLines("(this as unknown).x\n(this as any).y\nas anything\n")).toBe(2);
  });
});

describe("marks", () => {
  it("flags a file above its mark and a rowless file with a count", () => {
    expect(exceedances({ "a.ts": 2 }, { "a.ts": 3, "b.ts": 1 })).toEqual([
      { file: "a.ts", mark: 2, current: 3 },
      { file: "b.ts", mark: 0, current: 1 },
    ]);
    expect(exceedances({ "a.ts": 2 }, { "a.ts": 1 })).toEqual([]);
  });

  it("reports a mark above its count as stale", () => {
    expect(staleMarks({ "a.ts": 2, "c.ts": 1 }, { "a.ts": 1 })).toEqual([
      { file: "a.ts", mark: 2, current: 1 },
      { file: "c.ts", mark: 1, current: 0 },
    ]);
  });

  it("tightens only down and drops zero rows", () => {
    expect(tightened({ "a.ts": 2, "b.ts": 1, "c.ts": 3 }, { "a.ts": 5, "c.ts": 1 })).toEqual({
      "a.ts": 2,
      "c.ts": 1,
    });
  });
});

describe("main", () => {
  it("seeds once, then gates and tightens", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cast-count-"));
    const src = path.join(dir, "src");
    const mark = path.join(dir, "mark.json");
    await fs.mkdir(path.join(src, "sub"), { recursive: true });
    await fs.writeFile(path.join(src, "sub/a.ts"), "x as any\ny as any\n");
    await fs.writeFile(path.join(src, "a.test.ts"), "x as any\n");

    await main("seed", mark, src);
    expect(JSON.parse(await fs.readFile(mark, "utf-8"))).toEqual({ "sub/a.ts": 2 });
    await expect(main("seed", mark, src)).rejects.toThrow(/no reseed/);

    await fs.writeFile(path.join(src, "b.ts"), "z as any\n");
    await expect(main("check", mark, src)).rejects.toThrow(/above the committed mark/);
    await expect(main("tighten", mark, src)).rejects.toThrow(/above the committed mark/);

    await fs.rm(path.join(src, "b.ts"));
    await fs.writeFile(path.join(src, "sub/a.ts"), "x as any\n");
    await expect(main("check", mark, src)).rejects.toThrow(/STALE/);
    await main("tighten", mark, src);
    expect(JSON.parse(await fs.readFile(mark, "utf-8"))).toEqual({ "sub/a.ts": 1 });
    await main("check", mark, src);
    await fs.rm(dir, { recursive: true });
  });
});

describe("activerecord", () => {
  it("totals what the RFC's grep -rcE counts", async () => {
    const { stdout } = await promisify(execFile)(
      "grep",
      [
        "-rcE",
        String.raw`this: any\b|\(this as (any|unknown)|\bas any\b|as unknown as`,
        "--include=*.ts",
        "--exclude=*.test.ts",
        "packages/activerecord/src",
      ],
      { cwd: ROOT_DIR, maxBuffer: 1 << 24 },
    );
    const grepTotal = stdout
      .trim()
      .split("\n")
      .reduce((sum, line) => sum + Number(line.slice(line.lastIndexOf(":") + 1)), 0);
    expect(total(await measure())).toBe(grepTotal);
  });
});
