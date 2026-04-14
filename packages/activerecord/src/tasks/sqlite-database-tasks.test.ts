import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseAlreadyExists, NoDatabaseError } from "../errors.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `trails-sqlite-test-${process.pid}-${randomUUID()}.sqlite3`);
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

    const { SQLite3Adapter } = await import("../connection-adapters/sqlite3-adapter.js");
    const seedAdapter = new SQLite3Adapter(dbPath);
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

    await new SQLiteDatabaseTasks(sourceConfig).structureDump(dumpPath);

    const dumped = fs.readFileSync(dumpPath, "utf8");
    expect(dumped).toMatch(/CREATE TABLE widgets/);
    expect(dumped).toMatch(/index_widgets_on_name/);
    expect(dumped).toMatch(/CREATE TRIGGER touch_widgets/);

    const targetConfig = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: loadDbPath,
    });
    fs.writeFileSync(loadDbPath, "");
    await new SQLiteDatabaseTasks(targetConfig).structureLoad(dumpPath);

    const loadedAdapter = new SQLite3Adapter(loadDbPath);
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
