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
  const dir = await mkdtemp(join(tmpdir(), "ar-db-tasks-"));
  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(join(dir, "config", "database.ts"), FAKE_CONFIG, "utf8");
  return dir;
}

describe("DbTasksTest", () => {
  let out: string[];
  let err: string[];
  let createAll: ReturnType<typeof vi.fn>;
  let dropAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));

    createAll = vi.fn().mockResolvedValue(undefined);
    dropAll = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(DatabaseTasks, "create").mockImplementation(createAll);
    vi.spyOn(DatabaseTasks, "drop").mockImplementation(dropAll);
    vi.spyOn(DatabaseTasks, "checkProtectedEnvironmentsBang").mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DatabaseTasks.databaseConfiguration = null;
    (DatabaseTasks as unknown as { _root: null })._root = null;
  });

  it("db:create loads config and calls DatabaseTasks.create for current env", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    const code = await run(["db:create"], dir);
    expect(code).toBe(0);
    expect(createAll).toHaveBeenCalledOnce();
    expect(out.join("\n")).toContain("Created database ':memory:'");
  });

  it("db:create --all calls DatabaseTasks.create for every config", async () => {
    const dir = await makeFakeProject();
    const code = await run(["db:create", "--all"], dir);
    expect(code).toBe(0);
    expect(createAll).toHaveBeenCalledTimes(2);
  });

  it("db:drop loads config and calls DatabaseTasks.drop for current env", async () => {
    const dir = await makeFakeProject();
    DatabaseConfigurations.defaultEnv = "development";
    const code = await run(["db:drop"], dir);
    expect(code).toBe(0);
    expect(dropAll).toHaveBeenCalledOnce();
    expect(out.join("\n")).toContain("Dropped database ':memory:'");
  });

  it("db:drop --all calls DatabaseTasks.drop for every config", async () => {
    const dir = await makeFakeProject();
    const code = await run(["db:drop", "--all"], dir);
    expect(code).toBe(0);
    expect(dropAll).toHaveBeenCalledTimes(2);
  });

  it("db:create exits 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-db-tasks-noconfig-"));
    const code = await run(["db:create"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("failed to load config/database.ts");
  });

  it("db:drop exits 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-db-tasks-noconfig-"));
    const code = await run(["db:drop"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("failed to load config/database.ts");
  });
});
