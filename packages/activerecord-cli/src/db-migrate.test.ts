import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { run } from "./cli.js";
import { DatabaseTasks, DatabaseConfigurations, Migrator } from "@blazetrails/activerecord";

const FAKE_CONFIG = `
const config = { development: { adapter: "sqlite3", database: ":memory:", pool: 1 } };
export default config;
`;

async function makeFakeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ar-db-migrate-"));
  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(join(dir, "config", "database.ts"), FAKE_CONFIG, "utf8");
  return dir;
}

describe("DbMigrateTest", () => {
  let err: string[];
  let out: string[];
  let migrateSpy: ReturnType<typeof vi.fn>;
  let rollbackSpy: ReturnType<typeof vi.fn>;
  let loadSchemaCurrentSpy: ReturnType<typeof vi.fn>;
  let loadSeedSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
    migrateSpy = vi.fn().mockResolvedValue(undefined);
    rollbackSpy = vi.fn().mockResolvedValue(undefined);
    loadSchemaCurrentSpy = vi.fn().mockResolvedValue(undefined);
    loadSeedSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(DatabaseTasks, "migrate").mockImplementation(migrateSpy);
    vi.spyOn(DatabaseTasks, "rollback").mockImplementation(rollbackSpy);
    vi.spyOn(DatabaseTasks, "loadSchemaCurrent").mockImplementation(loadSchemaCurrentSpy);
    vi.spyOn(DatabaseTasks, "loadSeed").mockImplementation(loadSeedSpy);
    vi.spyOn(Migrator, "discoverMigrations").mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DatabaseTasks.databaseConfiguration = null;
    (DatabaseTasks as unknown as { _root: null })._root = null;
    DatabaseTasks.seedLoader = null;
  });

  it("db:migrate calls migrate with no args", async () => {
    DatabaseConfigurations.defaultEnv = "development";
    expect(await run(["db:migrate"], await makeFakeProject())).toBe(0);
    expect(migrateSpy).toHaveBeenCalledWith(undefined);
  });

  it("db:migrate --version passes version string", async () => {
    expect(await run(["db:migrate", "--version", "20240101000000"], await makeFakeProject())).toBe(
      0,
    );
    expect(migrateSpy).toHaveBeenCalledWith("20240101000000");
  });

  it("db:migrate calls Migrator.discoverMigrations before migrate", async () => {
    const discoverSpy = vi.spyOn(Migrator, "discoverMigrations").mockReturnValue([]);
    expect(await run(["db:migrate"], await makeFakeProject())).toBe(0);
    expect(discoverSpy).toHaveBeenCalled();
  });

  it("db:migrate exits 1 on missing config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-noconfig-"));
    expect(await run(["db:migrate"], dir)).toBe(1);
    expect(err.join("\n")).toContain("failed to load config/database.ts");
  });

  it("db:migrate exits 1 when migrate throws", async () => {
    migrateSpy.mockRejectedValueOnce(new Error("boom"));
    expect(await run(["db:migrate"], await makeFakeProject())).toBe(1);
    expect(err.join("\n")).toContain("db:migrate failed");
  });

  it("db:rollback calls rollback with step 1 by default", async () => {
    DatabaseConfigurations.defaultEnv = "development";
    expect(await run(["db:rollback"], await makeFakeProject())).toBe(0);
    expect(rollbackSpy).toHaveBeenCalledWith(1);
  });

  it("db:rollback --step 2 passes 2", async () => {
    expect(await run(["db:rollback", "--step", "2"], await makeFakeProject())).toBe(0);
    expect(rollbackSpy).toHaveBeenCalledWith(2);
  });

  it("db:rollback exits 1 when rollback throws", async () => {
    rollbackSpy.mockRejectedValueOnce(new Error("boom"));
    expect(await run(["db:rollback"], await makeFakeProject())).toBe(1);
    expect(err.join("\n")).toContain("db:rollback failed");
  });

  it("db:schema:load calls loadSchemaCurrent", async () => {
    DatabaseConfigurations.defaultEnv = "development";
    expect(await run(["db:schema:load"], await makeFakeProject())).toBe(0);
    expect(loadSchemaCurrentSpy).toHaveBeenCalledOnce();
  });

  it("db:seed prints friendly message when db/seeds.ts is absent", async () => {
    expect(await run(["db:seed"], await makeFakeProject())).toBe(0);
    expect(out.join("\n")).toContain("nothing to seed");
    expect(loadSeedSpy).not.toHaveBeenCalled();
  });

  it("db:seed calls loadSeed when db/seeds.ts exists", async () => {
    const dir = await makeFakeProject();
    await mkdir(join(dir, "db"), { recursive: true });
    await writeFile(join(dir, "db", "seeds.ts"), "export default {};", "utf8");
    expect(await run(["db:seed"], dir)).toBe(0);
    expect(loadSeedSpy).toHaveBeenCalledOnce();
  });
});
