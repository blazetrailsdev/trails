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
    expect(await run(["db:schema:dump"], ".")).toBe(1);
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

  it("generate:migration prints help for --help", async () => {
    expect(await run(["generate:migration", "--help"], ".")).toBe(0);
    expect(out.join("\n")).toContain("generate:migration");
  });

  it("generate:migration requires a name", async () => {
    expect(await run(["generate:migration"], ".")).toBe(1);
    expect(err.join("\n")).toContain("requires a migration name");
  });

  it("generate:migration writes file and prints create line with path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-gen-mig-"));
    expect(await run(["generate:migration", "AddEmailToUsers", "email:string"], dir)).toBe(0);
    expect(out[0]).toMatch(/create.*db[/\\]migrate[/\\]\d+_add_email_to_users\.ts/);
  });

  it("generate:migration --dry-run prints path without writing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-gen-mig-dry-"));
    expect(await run(["generate:migration", "--dry-run", "CreateThings"], dir)).toBe(0);
    expect(out[0]).toContain("(dry)");
    // db/migrate must not have been created
    await expect(
      import("fs/promises").then((m) => m.readdir(join(dir, "db", "migrate"))),
    ).rejects.toThrow();
  });

  it("generate:model writes both files and prints create lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-gen-model-"));
    expect(await run(["generate:model", "Post", "title:string"], dir)).toBe(0);
    const lines = out.join("\n");
    expect(lines).toMatch(/app[/\\]models[/\\]post\.ts/);
    expect(lines).toMatch(/db[/\\]migrate[/\\]\d+_create_posts\.ts/);
  });

  it("generate:model requires a name", async () => {
    expect(await run(["generate:model"], ".")).toBe(1);
    expect(err.join("\n")).toContain("requires a model name");
  });

  it("destroy:migration requires a name", async () => {
    expect(await run(["destroy:migration"], ".")).toBe(1);
    expect(err.join("\n")).toContain("requires a migration name");
  });

  it("destroy:migration deletes a generated migration and prints remove line", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-destroy-mig-"));
    await run(["generate:migration", "AddEmailToUsers"], dir);
    expect(await run(["destroy:migration", "AddEmailToUsers"], dir)).toBe(0);
    expect(out.join("\n")).toMatch(/remove.*add_email_to_users\.ts/);
  });

  it("destroy:migration --dry-run reports remove without deleting", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-destroy-mig-dry-"));
    await run(["generate:migration", "CreateThings"], dir);
    expect(await run(["destroy:migration", "--dry-run", "CreateThings"], dir)).toBe(0);
    expect(out.join("\n")).toContain("(dry)");
    expect(
      await import("fs/promises").then((m) => m.readdir(join(dir, "db", "migrate"))),
    ).toHaveLength(1);
  });

  it("destroy:migration exits 1 when no match exists", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-destroy-mig-miss-"));
    expect(await run(["destroy:migration", "NonExistent"], dir)).toBe(1);
    expect(err.join("\n")).toContain("no migration found");
  });

  it("destroy:model requires a name", async () => {
    expect(await run(["destroy:model"], ".")).toBe(1);
    expect(err.join("\n")).toContain("requires a model name");
  });

  it("destroy:model deletes model and migration and prints remove lines", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-destroy-model-"));
    await run(["generate:model", "Article"], dir);
    out.length = 0;
    expect(await run(["destroy:model", "Article"], dir)).toBe(0);
    const lines = out.join("\n");
    expect(lines).toMatch(/remove.*article\.ts/);
    expect(lines).toMatch(/remove.*create_articles\.ts/);
  });

  it("destroy:model --force deletes a hand-edited model", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-cli-destroy-model-force-"));
    const result = await run(["generate:model", "Post"], dir);
    expect(result).toBe(0);
    const modelPath = join(dir, "app", "models", "post.ts");
    await writeFile(modelPath, "// hand-edited\n");
    expect(await run(["destroy:model", "--force", "Post"], dir)).toBe(0);
    await expect(import("fs/promises").then((m) => m.readFile(modelPath))).rejects.toThrow();
  });
});
