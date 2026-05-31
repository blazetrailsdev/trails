import { describe, it, expect, beforeEach } from "vitest";
import { mkdtemp, readFile, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { arNew, parseDriver } from "./new.js";

const EXPECTED_RELATIVE = [
  "package.json",
  "tsconfig.json",
  ".gitignore",
  "config/database.ts",
  "db/migrate/.gitkeep",
  "db/seeds.ts",
  "app/models/index.ts",
  "db.ts",
];

describe("ArNewTest", () => {
  let parentDir: string;

  beforeEach(async () => {
    parentDir = await mkdtemp(join(tmpdir(), "ar-new-"));
  });

  it("scaffolds the expected file set under <app-name>/", async () => {
    const { created, skipped, appDir } = await arNew(parentDir, "myapp", "better-sqlite3");
    expect(appDir).toBe(join(parentDir, "myapp"));
    expect(created.sort()).toEqual([...EXPECTED_RELATIVE].sort());
    expect(skipped).toEqual([]);
    for (const rel of EXPECTED_RELATIVE) {
      await expect(readFile(join(appDir, rel), "utf8")).resolves.toBeDefined();
    }
  });

  it("package.json names the app and lists correct driver dep", async () => {
    const { appDir } = await arNew(parentDir, "blogapp", "pg");
    const pkg = JSON.parse(await readFile(join(appDir, "package.json"), "utf8"));
    expect(pkg.name).toBe("blogapp");
    expect(pkg.dependencies["pg"]).toMatch(/^\^/);
    expect(pkg.dependencies).toHaveProperty("@blazetrails/activerecord");
    expect(pkg.dependencies).not.toHaveProperty("better-sqlite3");
  });

  it.each([
    ["better-sqlite3", "sqlite3", ":memory:"],
    ["node-sqlite", "sqlite3", ":memory:"],
    ["pg", "postgresql", "myapp_development"],
    ["mysql2", "mysql2", "myapp_development"],
  ] as const)(
    "config/database.ts uses correct adapter for %s driver",
    async (driver, adapter, dbName) => {
      const { appDir } = await arNew(parentDir, "myapp", driver);
      const config = await readFile(join(appDir, "config/database.ts"), "utf8");
      expect(config).toContain(adapter);
      expect(config).toContain(dbName);
    },
  );

  it("skips existing files without --force, leaving them untouched", async () => {
    await mkdir(join(parentDir, "myapp"));
    await writeFile(join(parentDir, "myapp", "package.json"), '{"name":"stale"}\n', "utf8");
    const { created, skipped } = await arNew(parentDir, "myapp", "better-sqlite3");
    expect(skipped).toContain("package.json");
    expect(created).not.toContain("package.json");
    expect(await readFile(join(parentDir, "myapp", "package.json"), "utf8")).toBe(
      '{"name":"stale"}\n',
    );
  });

  it("node-sqlite: db.ts includes side-effect import, package.json has no driver dep", async () => {
    const { appDir } = await arNew(parentDir, "myapp", "node-sqlite");
    const dbTs = await readFile(join(appDir, "db.ts"), "utf8");
    expect(dbTs).toContain("@blazetrails/activesupport/sqlite/node-sqlite");
    const pkg = JSON.parse(await readFile(join(appDir, "package.json"), "utf8"));
    expect(Object.keys(pkg.dependencies)).not.toContain("node-sqlite");
    expect(Object.keys(pkg.dependencies)).not.toContain("better-sqlite3");
  });

  it("--force overwrites all generated files including init-owned ones", async () => {
    await arNew(parentDir, "myapp", "better-sqlite3");
    // Mutate one arNew-owned file and one init-owned file
    await writeFile(join(parentDir, "myapp", "package.json"), '{"name":"stale"}\n', "utf8");
    await writeFile(join(parentDir, "myapp", "db.ts"), "// stale\n", "utf8");

    const { created, skipped } = await arNew(parentDir, "myapp", "better-sqlite3", {
      force: true,
    });
    expect(skipped).toEqual([]);
    expect(created.sort()).toEqual([...EXPECTED_RELATIVE].sort());

    const pkg = JSON.parse(await readFile(join(parentDir, "myapp", "package.json"), "utf8"));
    expect(pkg.name).toBe("myapp");
    expect(await readFile(join(parentDir, "myapp", "db.ts"), "utf8")).not.toBe("// stale\n");
  });
});

describe("parseDriver", () => {
  it("defaults to better-sqlite3 when undefined", () => {
    expect(parseDriver(undefined)).toBe("better-sqlite3");
  });
  it("accepts valid driver names", () => {
    expect(parseDriver("pg")).toBe("pg");
    expect(parseDriver("mysql2")).toBe("mysql2");
    expect(parseDriver("better-sqlite3")).toBe("better-sqlite3");
    expect(parseDriver("node-sqlite")).toBe("node-sqlite");
  });
  it("returns null for unknown drivers", () => {
    expect(parseDriver("oracle")).toBeNull();
  });
});
