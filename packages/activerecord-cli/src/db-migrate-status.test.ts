import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { run } from "./cli.js";
import { DatabaseTasks, DatabaseConfigurations, Migrator } from "@blazetrails/activerecord";

const FAKE_CONFIG = `
const config = {
  development: { adapter: "sqlite3", database: "dev.sqlite3", pool: 1 },
  test: { adapter: "sqlite3", database: "test.sqlite3", pool: 1 },
};
export default config;
`;

async function makeFakeProject(config = FAKE_CONFIG): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ar-migrate-status-"));
  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(join(dir, "config", "database.ts"), config, "utf8");
  return dir;
}

describe("DbMigrateStatusTest", () => {
  let err: string[];
  let migrateStatusSpy: ReturnType<typeof vi.fn>;
  let withTemporaryPoolFn: ReturnType<typeof vi.fn>;
  let priorDefaultEnv: string;

  beforeEach(() => {
    err = [];
    priorDefaultEnv = DatabaseConfigurations.defaultEnv;
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
    migrateStatusSpy = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(DatabaseTasks, "migrateStatus").mockImplementation(migrateStatusSpy);
    withTemporaryPoolFn = vi
      .fn()
      .mockImplementation(async (_config: unknown, fn: (p: never) => unknown) => fn({} as never));
    vi.spyOn(DatabaseTasks, "withTemporaryPool").mockImplementation(withTemporaryPoolFn);
    vi.spyOn(Migrator, "discoverMigrations").mockReturnValue([]);
    DatabaseConfigurations.defaultEnv = "development";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DatabaseConfigurations.defaultEnv = priorDefaultEnv;
    DatabaseTasks.databaseConfiguration = null;
    (DatabaseTasks as unknown as { _root: null })._root = null;
  });

  it("establishes a temporary pool before reading status", async () => {
    const dir = await makeFakeProject();
    await run(["db:migrate:status"], dir);
    expect(withTemporaryPoolFn).toHaveBeenCalledOnce();
  });

  it("calls migrateStatus inside the temporary pool", async () => {
    const dir = await makeFakeProject();
    const code = await run(["db:migrate:status"], dir);
    expect(code).toBe(0);
    expect(migrateStatusSpy).toHaveBeenCalledOnce();
  });

  it("calls migrateStatus once per database config", async () => {
    DatabaseConfigurations.defaultEnv = "development";
    const dir = await makeFakeProject();
    const code = await run(["db:migrate:status"], dir);
    expect(code).toBe(0);
    expect(migrateStatusSpy).toHaveBeenCalledOnce();
  });

  it("exits 0 when no migrations exist", async () => {
    const dir = await makeFakeProject();
    const code = await run(["db:migrate:status"], dir);
    expect(code).toBe(0);
    expect(migrateStatusSpy).toHaveBeenCalledOnce();
  });

  it("exits 1 when migrateStatus throws (connection failure)", async () => {
    migrateStatusSpy.mockRejectedValueOnce(new Error("connection refused"));
    const dir = await makeFakeProject();
    const code = await run(["db:migrate:status"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("db:migrate:status failed");
  });

  it("exits 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-migrate-status-noconfig-"));
    const code = await run(["db:migrate:status"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("failed to load config/database.ts");
  });

  it("--all iterates all configured databases", async () => {
    const dir = await makeFakeProject(FAKE_CONFIG);
    const code = await run(["db:migrate:status", "--all"], dir);
    expect(code).toBe(0);
    expect(withTemporaryPoolFn).toHaveBeenCalledTimes(2);
    expect(migrateStatusSpy).toHaveBeenCalledTimes(2);
  });

  it("--all exits 1 when one config fails", async () => {
    withTemporaryPoolFn.mockRejectedValueOnce(new Error("cant connect"));
    const dir = await makeFakeProject(FAKE_CONFIG);
    const code = await run(["db:migrate:status", "--all"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("db:migrate:status failed for");
  });

  it("--help prints usage", async () => {
    const out: string[] = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    const code = await run(["db:migrate:status", "--help"], await makeFakeProject());
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("db:migrate:status");
  });
});
