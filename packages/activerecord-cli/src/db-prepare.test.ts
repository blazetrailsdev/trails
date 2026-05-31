import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { run } from "./cli.js";
import { DatabaseTasks, DatabaseConfigurations } from "@blazetrails/activerecord";

const FAKE_CONFIG = `
const config = {
  development: { adapter: "sqlite3", database: ":memory:", pool: 1 },
  test: { adapter: "sqlite3", database: ":memory:", pool: 1 },
};
export default config;
`;

async function makeFakeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ar-db-prepare-"));
  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(join(dir, "config", "database.ts"), FAKE_CONFIG, "utf8");
  return dir;
}

describe("DbPrepareTest", () => {
  let out: string[];
  let err: string[];
  let createSpy: ReturnType<typeof vi.fn>;
  let dropSpy: ReturnType<typeof vi.fn>;
  let loadSchemaSpy: ReturnType<typeof vi.fn>;
  let loadSeedSpy: ReturnType<typeof vi.fn>;
  let prepareAllSpy: ReturnType<typeof vi.fn>;
  let migrateSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));

    createSpy = vi.fn().mockResolvedValue(undefined);
    dropSpy = vi.fn().mockResolvedValue(undefined);
    loadSchemaSpy = vi.fn().mockResolvedValue(undefined);
    loadSeedSpy = vi.fn().mockResolvedValue(undefined);
    prepareAllSpy = vi.fn().mockResolvedValue(undefined);
    migrateSpy = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(DatabaseTasks, "create").mockImplementation(createSpy);
    vi.spyOn(DatabaseTasks, "drop").mockImplementation(dropSpy);
    vi.spyOn(DatabaseTasks, "loadSchemaCurrent").mockImplementation(loadSchemaSpy);
    vi.spyOn(DatabaseTasks, "loadSeed").mockImplementation(loadSeedSpy);
    vi.spyOn(DatabaseTasks, "prepareAll").mockImplementation(prepareAllSpy);
    vi.spyOn(DatabaseTasks, "migrate").mockImplementation(migrateSpy);
    vi.spyOn(DatabaseTasks, "checkProtectedEnvironmentsBang").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DatabaseTasks.databaseConfiguration = null;
    DatabaseTasks.seedLoader = null;
    (DatabaseTasks as unknown as { _root: null })._root = null;
  });

  // db:setup

  it("db:setup calls create, loadSchemaCurrent, loadSeed in order", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    const callOrder: string[] = [];
    createSpy.mockImplementation(() => {
      callOrder.push("create");
      return Promise.resolve();
    });
    loadSchemaSpy.mockImplementation(() => {
      callOrder.push("loadSchema");
      return Promise.resolve();
    });
    loadSeedSpy.mockImplementation(() => {
      callOrder.push("loadSeed");
      return Promise.resolve();
    });

    const code = await run(["db:setup"], dir);
    expect(code).toBe(0);
    expect(callOrder).toEqual(["create", "loadSchema", "loadSeed"]);
  });

  it("db:setup exits 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-db-setup-noconfig-"));
    const code = await run(["db:setup"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("failed to load config/database.ts");
  });

  it("db:setup exits 1 when create fails", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    createSpy.mockRejectedValue(new Error("create boom"));
    const code = await run(["db:setup"], dir);
    expect(code).toBe(1);
    expect(loadSchemaSpy).not.toHaveBeenCalled();
  });

  it("db:setup exits 1 when loadSchemaCurrent fails", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    loadSchemaSpy.mockRejectedValue(new Error("schema boom"));
    const code = await run(["db:setup"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("schema load failed");
  });

  // db:reset

  it("db:reset calls drop then create/loadSchema/loadSeed", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    const callOrder: string[] = [];
    dropSpy.mockImplementation(() => {
      callOrder.push("drop");
      return Promise.resolve();
    });
    createSpy.mockImplementation(() => {
      callOrder.push("create");
      return Promise.resolve();
    });
    loadSchemaSpy.mockImplementation(() => {
      callOrder.push("loadSchema");
      return Promise.resolve();
    });
    loadSeedSpy.mockImplementation(() => {
      callOrder.push("loadSeed");
      return Promise.resolve();
    });

    const code = await run(["db:reset"], dir);
    expect(code).toBe(0);
    expect(callOrder[0]).toBe("drop");
    expect(callOrder).toContain("create");
    expect(callOrder).toContain("loadSchema");
    expect(callOrder).toContain("loadSeed");
  });

  it("db:reset exits 1 when drop fails", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    dropSpy.mockRejectedValue(new Error("drop boom"));
    const code = await run(["db:reset"], dir);
    expect(code).toBe(1);
    expect(createSpy).not.toHaveBeenCalled();
  });

  it("db:reset exits 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-db-reset-noconfig-"));
    const code = await run(["db:reset"], dir);
    expect(code).toBe(1);
  });

  // db:prepare

  it("db:prepare calls DatabaseTasks.prepareAll", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    const code = await run(["db:prepare"], dir);
    expect(code).toBe(0);
    expect(prepareAllSpy).toHaveBeenCalledOnce();
  });

  it("db:prepare exits 1 when prepareAll throws", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    prepareAllSpy.mockRejectedValue(new Error("prepare boom"));
    const code = await run(["db:prepare"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("db:prepare failed");
  });

  it("db:prepare exits 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-db-prepare-noconfig-"));
    const code = await run(["db:prepare"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("failed to load config/database.ts");
  });

  // --help

  it("db:setup --help prints help text", async () => {
    const code = await run(["db:setup", "--help"], ".");
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("db:setup");
  });

  it("db:reset --help prints help text", async () => {
    const code = await run(["db:reset", "--help"], ".");
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("db:reset");
  });

  it("db:prepare --help prints help text", async () => {
    const code = await run(["db:prepare", "--help"], ".");
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("db:prepare");
  });
});
