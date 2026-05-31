import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { run } from "./cli.js";
import { DatabaseTasks, Migrator } from "@blazetrails/activerecord";
import { checkPendingMigrations } from "./pending-migrations.js";

const FAKE_CONFIG = `
const config = {
  development: { adapter: "sqlite3", database: ":memory:", pool: 1 },
  test: { adapter: "sqlite3", database: ":memory:", pool: 1 },
};
export default config;
`;

async function makeFakeProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "ar-pending-"));
  await mkdir(join(dir, "config"), { recursive: true });
  await writeFile(join(dir, "config", "database.ts"), FAKE_CONFIG, "utf8");
  return dir;
}

const PROXY_A = {
  version: "20240101000001",
  name: "CreateUsers",
  migration: () => ({}) as unknown as import("@blazetrails/activerecord").MigrationLike,
};
const PROXY_B = {
  version: "20240101000002",
  name: "AddIndex",
  migration: () => ({}) as unknown as import("@blazetrails/activerecord").MigrationLike,
};

describe("PendingMigrationsTest", () => {
  let err: string[];
  let out: string[];
  let withTemporaryConnectionSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    out = [];
    err = [];
    vi.spyOn(console, "log").mockImplementation((m) => void out.push(String(m)));
    vi.spyOn(console, "error").mockImplementation((m) => void err.push(String(m)));
    vi.spyOn(Migrator, "discoverMigrations").mockReturnValue([]);
    withTemporaryConnectionSpy = vi.fn();
    vi.spyOn(DatabaseTasks, "withTemporaryConnection").mockImplementation(
      withTemporaryConnectionSpy,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    DatabaseTasks.databaseConfiguration = null;
    (DatabaseTasks as unknown as { _root: null })._root = null;
  });

  it("db:abort_if_pending_migrations exits 0 when no pending migrations", async () => {
    withTemporaryConnectionSpy.mockImplementation(
      async (_config: unknown, fn: (adapter: unknown) => Promise<void>) => {
        await fn({});
      },
    );
    vi.spyOn(Migrator.prototype, "pendingMigrationsReadOnly").mockResolvedValue([]);
    expect(await run(["db:abort_if_pending_migrations"], await makeFakeProject())).toBe(0);
    expect(err).toHaveLength(0);
  });

  it("db:abort_if_pending_migrations exits 1 and lists pending versions", async () => {
    withTemporaryConnectionSpy.mockImplementation(
      async (_config: unknown, fn: (adapter: unknown) => Promise<void>) => {
        await fn({});
      },
    );
    vi.spyOn(Migrator.prototype, "pendingMigrationsReadOnly").mockResolvedValue([PROXY_A, PROXY_B]);
    const code = await run(["db:abort_if_pending_migrations"], await makeFakeProject());
    expect(code).toBe(1);
    const output = err.join("\n");
    expect(output).toContain("20240101000001");
    expect(output).toContain("20240101000002");
    expect(output).toContain("ar db:migrate");
  });

  it("db:abort_if_pending_migrations exits 1 with a single pending migration", async () => {
    withTemporaryConnectionSpy.mockImplementation(
      async (_config: unknown, fn: (adapter: unknown) => Promise<void>) => {
        await fn({});
      },
    );
    vi.spyOn(Migrator.prototype, "pendingMigrationsReadOnly").mockResolvedValue([PROXY_A]);
    const code = await run(["db:abort_if_pending_migrations"], await makeFakeProject());
    expect(code).toBe(1);
    const output = err.join("\n");
    expect(output).toContain("1 pending migration:");
    expect(output).toContain("20240101000001");
  });

  it("db:abort_if_pending_migrations exits 1 on missing config", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ar-noconfig-"));
    expect(await run(["db:abort_if_pending_migrations"], dir)).toBe(1);
    expect(err.join("\n")).toContain("config/database.ts");
  });

  it("checkPendingMigrations resolves pending list from cwd", async () => {
    withTemporaryConnectionSpy.mockImplementation(
      async (_config: unknown, fn: (adapter: unknown) => Promise<void>) => {
        await fn({});
      },
    );
    vi.spyOn(Migrator.prototype, "pendingMigrationsReadOnly").mockResolvedValue([PROXY_A]);
    const dir = await makeFakeProject();
    const pending = await checkPendingMigrations(dir);
    expect(pending).toHaveLength(1);
    expect(pending[0].version).toBe("20240101000001");
  });

  it("checkPendingMigrations returns empty array when no pending migrations", async () => {
    withTemporaryConnectionSpy.mockImplementation(
      async (_config: unknown, fn: (adapter: unknown) => Promise<void>) => {
        await fn({});
      },
    );
    vi.spyOn(Migrator.prototype, "pendingMigrationsReadOnly").mockResolvedValue([]);
    const dir = await makeFakeProject();
    const pending = await checkPendingMigrations(dir);
    expect(pending).toHaveLength(0);
  });
});
