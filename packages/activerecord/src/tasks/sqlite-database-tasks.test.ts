import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as activesupport from "@blazetrails/activesupport";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseAlreadyExists, NoDatabaseError } from "../errors.js";
import { SchemaDumper } from "../schema-dumper.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `trails-sqlite-test-${process.pid}-${randomUUID()}.sqlite3`);
}

/** Rails seeds these fixtures with backticked `sqlite3` calls. */
function runSqlite3(database: string, sql: string): void {
  const result = activesupport.getChildProcess().spawnSync("sqlite3", [database, sql]);
  if (result.status !== 0) throw new Error(`sqlite3 failed: ${result.stderr}`);
}

describe("SQLiteDatabaseTasks", () => {
  const created: string[] = [];

  afterEach(() => {
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
    created.length = 0;
  });

  it("test_db_create_creates_file", async () => {
    const dbPath = tmpDbPath();
    created.push(dbPath);
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: dbPath,
    });
    await new SQLiteDatabaseTasks(config).create();
    expect(fs.existsSync(dbPath)).toBe(true);
  });

  it("test_db_create_when_file_exists_raises", async () => {
    const dbPath = tmpDbPath();
    created.push(dbPath);
    fs.writeFileSync(dbPath, "");
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: dbPath,
    });
    await expect(new SQLiteDatabaseTasks(config).create()).rejects.toBeInstanceOf(
      DatabaseAlreadyExists,
    );
  });

  it("test_db_drop_removes_file", async () => {
    const dbPath = tmpDbPath();
    created.push(dbPath);
    fs.writeFileSync(dbPath, "");
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: dbPath,
    });
    await new SQLiteDatabaseTasks(config).drop();
    expect(fs.existsSync(dbPath)).toBe(false);
  });

  it("test_db_drop_missing_raises_no_database_error", async () => {
    const dbPath = tmpDbPath();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: dbPath,
    });
    await expect(new SQLiteDatabaseTasks(config).drop()).rejects.toBeInstanceOf(NoDatabaseError);
  });

  it("test_charset_returns_utf8", () => {
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: ":memory:",
    });
    expect(new SQLiteDatabaseTasks(config).charset()).toBe("UTF-8");
  });

  it("test_registers_with_database_tasks", () => {
    DatabaseTasks.clearRegisteredTasks();
    SQLiteDatabaseTasks.register();
    expect(DatabaseTasks.resolveTask("sqlite3")).toBeDefined();
  });

  it("test_structure_dump_and_load_round_trip_via_adapter", async () => {
    const dbPath = tmpDbPath();
    const dumpPath = path.join(os.tmpdir(), `trails-sqlite-dump-${randomUUID()}.sql`);
    const loadDbPath = tmpDbPath();
    created.push(dbPath, dumpPath, loadDbPath);

    const sourceConfig = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: dbPath,
    });

    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const seedAdapter = new BetterSQLite3Adapter(dbPath);
    await seedAdapter.executeMutation(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL, updated_at TEXT)",
    );
    await seedAdapter.executeMutation("CREATE INDEX index_widgets_on_name ON widgets(name)");
    await seedAdapter.executeMutation(
      "CREATE TRIGGER touch_widgets AFTER UPDATE ON widgets " +
        "BEGIN " +
        "UPDATE widgets SET updated_at = datetime('now') WHERE id = NEW.id; " +
        "END",
    );
    await (seedAdapter as unknown as { close(): Promise<void> }).close();

    // Rails' structure_dump reaches its adapter with a bare
    // `ActiveRecord::Base.lease_connection` (sqlite_database_tasks.rb:43,68-70),
    // so the task's db_config has to be the established one before it runs —
    // which is the caller's job, as it is for `db:schema:dump`
    // (database_tasks.rb:523-530).
    await DatabaseTasks.withTemporaryConnection(sourceConfig, async () => {
      await new SQLiteDatabaseTasks(sourceConfig).structureDump(dumpPath);
    });

    const dumped = fs.readFileSync(dumpPath, "utf8");
    expect(dumped).toMatch(/CREATE TABLE widgets/);
    expect(dumped).toMatch(/index_widgets_on_name/);
    expect(dumped).toMatch(/CREATE TRIGGER touch_widgets/);

    // Explicit teardown for the raw-created `widgets` table (the dbPath file is
    // also unlinked in afterEach) to balance require-table-teardown.
    const cleanupAdapter = new BetterSQLite3Adapter(dbPath);
    await cleanupAdapter.executeMutation("DROP TABLE IF EXISTS widgets");
    await (cleanupAdapter as unknown as { close(): Promise<void> }).close();

    const targetConfig = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: loadDbPath,
    });
    fs.writeFileSync(loadDbPath, "");
    await DatabaseTasks.withTemporaryConnection(targetConfig, async () => {
      await new SQLiteDatabaseTasks(targetConfig).structureLoad(dumpPath);
    });

    const loadedAdapter = new BetterSQLite3Adapter(loadDbPath);
    try {
      const tables = (await loadedAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
      )) as Array<{ name: string }>;
      expect(tables.map((r) => r.name)).toContain("widgets");
      const idx = (await loadedAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='index_widgets_on_name'",
      )) as unknown[];
      expect(idx.length).toBe(1);
      const trigger = (await loadedAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name='touch_widgets'",
      )) as unknown[];
      expect(trigger.length).toBe(1);
    } finally {
      await (loadedAdapter as unknown as { close(): Promise<void> }).close();
    }
  });
});

// `sqlite_rake_test.rb:166-231` (SqliteStructureDumpTest) and `:245-262`
// (SqliteStructureLoadTest). Rails seeds the fixture database with backticked
// `sqlite3` calls; here that is the same CLI the tasks themselves shell out to.
describe("SqliteStructureDumpTest", () => {
  const created: string[] = [];
  let database: string;
  let configuration: HashConfig;

  beforeEach(() => {
    database = tmpDbPath();
    created.push(database);
    configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });
    for (const table of ["bar", "foo", "prefix_foo", "ignored_foo"]) {
      runSqlite3(database, `CREATE TABLE ${table}(id INTEGER)`);
    }
  });

  afterEach(() => {
    SchemaDumper.ignoreTables = [];
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
    created.length = 0;
  });

  it("test_structure_dump", async () => {
    const filename = path.join(os.tmpdir(), `awesome-file-${randomUUID()}.sql`);
    created.push(filename);

    await new SQLiteDatabaseTasks(configuration).structureDump(filename);

    expect(fs.existsSync(database)).toBe(true);
    expect(fs.existsSync(filename)).toBe(true);
    expect(fs.readFileSync(filename, "utf8")).toMatch(/CREATE TABLE foo/);
    expect(fs.readFileSync(filename, "utf8")).toMatch(/CREATE TABLE bar/);
  });

  it("test_structure_dump_with_ignore_tables", async () => {
    const filename = path.join(os.tmpdir(), `awesome-file-${randomUUID()}.sql`);
    created.push(filename);
    SchemaDumper.ignoreTables = [/^prefix_/, "ignored_foo"];

    await new SQLiteDatabaseTasks(configuration).structureDump(filename);

    expect(fs.existsSync(database)).toBe(true);
    expect(fs.existsSync(filename)).toBe(true);
    const contents = fs.readFileSync(filename, "utf8");
    expect(contents).toMatch(/bar/);
    expect(contents).not.toMatch(/prefix_foo/);
    expect(contents).not.toMatch(/ignored_foo/);
  });

  it("test_structure_dump_execution_fails", async () => {
    const filename = path.join(os.tmpdir(), `awesome-file-${randomUUID()}.sql`);
    created.push(filename);

    await expect(
      new SQLiteDatabaseTasks(configuration).structureDump(filename, ["--noop"]),
    ).rejects.toThrow(/failed to execute:/);
  });
});

describe("SqliteStructureLoadTest", () => {
  const created: string[] = [];

  afterEach(() => {
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
    created.length = 0;
  });

  it("test_structure_load", async () => {
    const database = tmpDbPath();
    const filename = path.join(os.tmpdir(), `awesome-file-${randomUUID()}.sql`);
    created.push(database, filename);
    const configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });

    fs.writeFileSync(filename, "select datetime('now', 'localtime');\n");
    await new SQLiteDatabaseTasks(configuration).structureLoad(filename);
    expect(fs.existsSync(database)).toBe(true);
  });
});

describe("SQLiteDatabaseTasks in-memory URI variants", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const assertNoFsWrites = () => {
    const fsObj = activesupport.getFs();
    const mkdirSpy = vi.spyOn(fsObj, "mkdirSync").mockImplementation(() => undefined);
    const writeSpy = vi.spyOn(fsObj, "writeFileSync").mockImplementation(() => undefined as any);
    const unlinkSpy = vi.spyOn(fsObj, "unlinkSync").mockImplementation(() => undefined);
    return { mkdirSpy, writeSpy, unlinkSpy };
  };

  it("test_db_create_is_noop_for_file_memory_uri", async () => {
    const { mkdirSpy, writeSpy } = assertNoFsWrites();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "file::memory:?cache=shared",
    });
    await expect(new SQLiteDatabaseTasks(config).create()).resolves.toBeUndefined();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("test_db_drop_is_noop_for_file_memory_uri", async () => {
    const { unlinkSpy } = assertNoFsWrites();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "file::memory:?cache=shared",
    });
    await expect(new SQLiteDatabaseTasks(config).drop()).resolves.toBeUndefined();
    expect(unlinkSpy).not.toHaveBeenCalled();
  });

  it("test_db_create_is_noop_for_canonical_memory", async () => {
    const { mkdirSpy, writeSpy } = assertNoFsWrites();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: ":memory:",
    });
    await expect(new SQLiteDatabaseTasks(config).create()).resolves.toBeUndefined();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("test_db_create_is_noop_for_named_file_memory_uri", async () => {
    const { mkdirSpy, writeSpy } = assertNoFsWrites();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "file:memdb1?mode=memory&cache=shared",
    });
    await expect(new SQLiteDatabaseTasks(config).create()).resolves.toBeUndefined();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("test_db_drop_is_noop_for_named_file_memory_uri", async () => {
    const { unlinkSpy } = assertNoFsWrites();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: "file:memdb1?mode=memory&cache=shared",
    });
    await expect(new SQLiteDatabaseTasks(config).drop()).resolves.toBeUndefined();
    expect(unlinkSpy).not.toHaveBeenCalled();
  });
});
