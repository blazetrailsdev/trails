import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { run } from "./cli.js";

describe("ArCliTest", () => {
  let out: string[];
  let err: string[];

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
  });

  afterEach(() => vi.restoreAllMocks());

  it("prints help for no command, help, and --help", async () => {
    for (const argv of [[], ["help"], ["--help"], ["-h"]]) {
      expect(await run(argv, ".")).toBe(0);
    }
    expect(out.join("\n")).toContain("Scaffold config/database.ts");
  });

  it("prints init usage for init --help without scaffolding", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-"));
    expect(await run(["init", "--help"], dir)).toBe(0);
    expect(out.join("\n")).toContain("scaffold a standalone");
    await expect(readFile(join(dir, "db.ts"), "utf8")).rejects.toThrow();
  });

  it("init scaffolds the project and reports created files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-"));
    expect(await run(["init"], dir)).toBe(0);
    await expect(readFile(join(dir, "db.ts"), "utf8")).resolves.toBeTypeOf("string");
    expect(out.join("\n")).toContain("create  db.ts");
  });

  it("exits 1 for deferred commands and unknown commands", async () => {
    expect(await run(["db:migrate"], ".")).toBe(1);
    expect(err.join("\n")).toContain("not implemented");
    expect(await run(["frobnicate"], ".")).toBe(1);
    expect(err.join("\n")).toContain('unknown command "frobnicate"');
  });
});
