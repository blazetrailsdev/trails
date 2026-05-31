import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
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

  it("generate:manifest writes app/models/index.ts, is idempotent, and --check detects drift", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-"));
    const models = join(dir, "app", "models"); // the default scan root
    await mkdir(models, { recursive: true });
    await writeFile(
      join(models, "user.ts"),
      `import { Base } from "@blazetrails/activerecord";\nexport class User extends Base {}\n`,
      "utf8",
    );

    expect(await run(["generate:manifest", "--check"], dir)).toBe(1);
    expect(err.join("\n")).toContain("out of date");

    expect(await run(["generate:manifest"], dir)).toBe(0);
    expect(out.join("\n")).toContain("write");
    expect(await readFile(join(models, "index.ts"), "utf8")).toContain("registerModel");

    out.length = 0;
    expect(await run(["generate:manifest"], dir)).toBe(0);
    expect(out.join("\n")).toContain("unchanged");
    // --root targets the models dir directly; now up to date, exits 0.
    expect(await run(["generate:manifest", "--check", "--root", models], dir)).toBe(0);
  });

  it("resolves a relative --root against the passed cwd, not process.cwd()", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-"));
    const models = join(dir, "src", "models"); // a non-default root, via --root
    await mkdir(models, { recursive: true });
    await writeFile(
      join(models, "user.ts"),
      `import { Base } from "@blazetrails/activerecord";\nexport class User extends Base {}\n`,
      "utf8",
    );

    expect(await run(["generate:manifest", "--root", "src/models"], dir)).toBe(0);
    // The manifest landed under `dir`, not the test runner's process cwd.
    expect(await readFile(join(models, "index.ts"), "utf8")).toContain(`import { User }`);
  });

  it("--check drift message echoes the custom --root in the suggested fix", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-"));
    await mkdir(join(dir, "src", "models"), { recursive: true });
    await writeFile(
      join(dir, "src", "models", "user.ts"),
      `import { Base } from "@blazetrails/activerecord";\nexport class User extends Base {}\n`,
      "utf8",
    );
    expect(await run(["generate:manifest", "--check", "--root", "src/models"], dir)).toBe(1);
    expect(err.join("\n")).toContain("Run `ar generate:manifest --root src/models`");
  });

  it("fails fast when --root is given without a directory argument", async () => {
    expect(await run(["generate:manifest", "--root"], ".")).toBe(1);
    expect(err.join("\n")).toContain("--root requires a directory");
    err.length = 0;
    // A following flag must not be swallowed as the directory.
    expect(await run(["generate:manifest", "--root", "--check"], ".")).toBe(1);
    expect(err.join("\n")).toContain("--root requires a directory");
  });
});
