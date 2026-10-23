import { describe, it, expect } from "vitest";
import { execFile } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import {
  CAST_PATTERN,
  ROOT_DIR,
  countLines,
  exceedances,
  main,
  measure,
  measureAt,
  total,
} from "./cast-count.js";

const run = promisify(execFile);

describe("countLines", () => {
  it("counts matching lines, not matches", () => {
    expect(countLines("const a = b as any as unknown as C;\nfunction f(this: any) {}\nok\n")).toBe(
      2,
    );
    expect(countLines("(this as unknown).x\n(this as any).y\nas anything\n")).toBe(2);
  });
});

describe("exceedances", () => {
  it("flags a file above its base count and a file new at a non-zero count", () => {
    expect(exceedances({ "a.ts": 2 }, { "a.ts": 3, "b.ts": 1 })).toEqual([
      { file: "a.ts", base: 2, current: 3 },
      { file: "b.ts", base: 0, current: 1 },
    ]);
  });

  it("passes a file at or below its base count", () => {
    expect(exceedances({ "a.ts": 2, "c.ts": 1 }, { "a.ts": 1 })).toEqual([]);
  });
});

describe("main", () => {
  it("compares the working tree against the merge-base", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "cast-count-"));
    const git = (...args: string[]) => run("git", args, { cwd: dir });
    const src = path.join(dir, "packages/activerecord/src");
    await fs.mkdir(path.join(src, "sub"), { recursive: true });
    await fs.writeFile(path.join(src, "sub/a.ts"), "x as any\ny as any\n");
    await fs.writeFile(path.join(src, "a.test.ts"), "x as any\n");
    await git("init", "-q", "-b", "main");
    await git("add", ".");
    await git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");

    expect(await measureAt("HEAD", dir)).toEqual({ "sub/a.ts": 2 });
    await expect(main("main", dir)).resolves.toMatch(/OK \(2, 2/);

    await fs.writeFile(path.join(src, "b.ts"), "z as any\n");
    await expect(main("main", dir)).rejects.toThrow(/b\.ts: 0 → 1/);

    await fs.rm(path.join(src, "b.ts"));
    await fs.writeFile(path.join(src, "sub/a.ts"), "x as any\n");
    await expect(main("main", dir)).resolves.toMatch(/OK \(1, 2/);
    await fs.rm(dir, { recursive: true });
  });
});

describe("activerecord", () => {
  it("totals what the RFC's grep -rcE counts", async () => {
    const { stdout } = await run(
      "grep",
      ["-rcE", CAST_PATTERN, "--include=*.ts", "--exclude=*.test.ts", "packages/activerecord/src"],
      { cwd: ROOT_DIR, maxBuffer: 1 << 24 },
    );
    const grepTotal = stdout
      .trim()
      .split("\n")
      .reduce((sum, line) => sum + Number(line.slice(line.lastIndexOf(":") + 1)), 0);
    expect(total(await measure())).toBe(grepTotal);
  });

  it("reads the same counts at HEAD through git grep", async () => {
    const { stdout } = await run("git", ["status", "--porcelain", "packages/activerecord/src"], {
      cwd: ROOT_DIR,
    });
    if (stdout !== "") return;
    expect(await measureAt("HEAD")).toEqual(await measure());
  });
});
