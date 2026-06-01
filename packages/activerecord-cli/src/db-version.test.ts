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
  const dir = await mkdtemp(join(tmpdir(), "ar-db-version-"));
  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(join(dir, "config", "database.ts"), config, "utf8");
  return dir;
}

describe("DbVersionTest", () => {
  let out: string[];
  let err: string[];
  let currentVersionSpy: ReturnType<typeof vi.fn>;
  let withTemporaryPoolFn: ReturnType<typeof vi.fn>;
  let priorDefaultEnv: string;
  let priorTrailsEnv: string | undefined;

  beforeEach(() => {
    out = [];
    err = [];
    priorDefaultEnv = DatabaseConfigurations.defaultEnv;
    priorTrailsEnv = process.env["TRAILS_ENV"];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
    currentVersionSpy = vi.fn().mockResolvedValue(20260101000001);
    vi.spyOn(DatabaseTasks, "currentVersion").mockImplementation(currentVersionSpy);
    withTemporaryPoolFn = vi
      .fn()
      .mockImplementation(async (_config: unknown, fn: () => unknown) => fn());
    vi.spyOn(DatabaseTasks, "withTemporaryPool").mockImplementation(withTemporaryPoolFn);
    vi.spyOn(Migrator, "discoverMigrations").mockReturnValue([]);
    DatabaseConfigurations.defaultEnv = "development";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DatabaseConfigurations.defaultEnv = priorDefaultEnv;
    if (priorTrailsEnv === undefined) delete process.env["TRAILS_ENV"];
    else process.env["TRAILS_ENV"] = priorTrailsEnv;
    DatabaseTasks.databaseConfiguration = null;
    (DatabaseTasks as unknown as { _root: null })._root = null;
  });

  it("prints Current version for the active env", async () => {
    const dir = await makeFakeProject();
    const code = await run(["db:version"], dir);
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Current version: 20260101000001");
  });

  it("prints Current version: 0 when no migrations applied", async () => {
    currentVersionSpy.mockResolvedValue(0);
    const dir = await makeFakeProject();
    const code = await run(["db:version"], dir);
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("Current version: 0");
  });

  it("establishes a temporary pool before querying", async () => {
    const dir = await makeFakeProject();
    await run(["db:version"], dir);
    expect(withTemporaryPoolFn).toHaveBeenCalledOnce();
  });

  it("--all iterates all configured databases with db-prefixed header", async () => {
    const dir = await makeFakeProject(FAKE_CONFIG);
    const code = await run(["db:version", "--all"], dir);
    expect(code).toBe(0);
    expect(withTemporaryPoolFn).toHaveBeenCalledTimes(2);
    expect(currentVersionSpy).toHaveBeenCalledTimes(2);
    const combined = out.join("\n");
    expect(combined).toContain("dev.sqlite3");
    expect(combined).toContain("test.sqlite3");
  });

  it("exits 1 when currentVersion throws", async () => {
    currentVersionSpy.mockRejectedValueOnce(new Error("connection refused"));
    const dir = await makeFakeProject();
    const code = await run(["db:version"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("db:version failed");
  });

  it("exits 1 when config/database.ts is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-db-version-noconfig-"));
    const code = await run(["db:version"], dir);
    expect(code).toBe(1);
    expect(err.join("\n")).toContain("failed to load config/database.ts");
  });

  it("--env overrides TRAILS_ENV for the invocation", async () => {
    const dir = await makeFakeProject();
    delete process.env["TRAILS_ENV"];
    DatabaseConfigurations.defaultEnv = "development";
    await run(["db:version", "--env", "test"], dir);
    expect(process.env["TRAILS_ENV"]).toBe("test");
  });

  it("--help prints usage", async () => {
    const code = await run(["db:version", "--help"], await makeFakeProject());
    expect(code).toBe(0);
    expect(out.join("\n")).toContain("db:version");
  });
});
