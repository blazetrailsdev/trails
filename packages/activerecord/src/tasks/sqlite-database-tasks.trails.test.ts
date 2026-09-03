import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getFs } from "@blazetrails/ruby-compat";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { DatabaseTasks } from "./database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { DatabaseAlreadyExists, NoDatabaseError } from "../errors.js";
import { SchemaDumper } from "../schema-dumper.js";
import { Base } from "../base.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `trails-sqlite-test-${process.pid}-${randomUUID()}.sqlite3`);
}

function withRestoredConnection(): void {
  let previous: ReturnType<typeof Base.removeConnection>;
  beforeEach(async () => {
    previous = Base.removeConnection();
    if (previous) await Base.establishConnection(previous.configuration);
  });
  afterEach(async () => {
    Base.removeConnection();
    if (previous) await Base.establishConnection(previous.configuration);
  });
}

describe("SQLiteDatabaseTasks", () => {
  const created: string[] = [];

  withRestoredConnection();

  afterEach(() => {
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    created.length = 0;
  });

  it("create guards and connects against the same relative database", async () => {
    const name = `trails-relative-${process.pid}-${randomUUID()}.sqlite3`;
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "trails-tasks-root-"));
    const cwdRelative = path.resolve(name);
    const rootJoined = path.join(root, name);
    created.push(cwdRelative, rootJoined);

    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: name,
    });
    await new SQLiteDatabaseTasks(config, root).create();

    expect(fs.existsSync(cwdRelative)).toBe(true);
    expect(fs.existsSync(rootJoined)).toBe(false);

    await expect(new SQLiteDatabaseTasks(config, root).create()).rejects.toBeInstanceOf(
      DatabaseAlreadyExists,
    );
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("test_registers_with_database_tasks", () => {
    DatabaseTasks.clearRegisteredTasks();
    SQLiteDatabaseTasks.register();
    expect(DatabaseTasks["classForAdapter"]("sqlite3")).toBeDefined();
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
    try {
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

      await DatabaseTasks.withTemporaryConnection(sourceConfig, async () => {
        await new SQLiteDatabaseTasks(sourceConfig).structureDump(dumpPath);
      });

      const dumped = fs.readFileSync(dumpPath, "utf8");
      expect(dumped).toMatch(/CREATE TABLE widgets/);
      expect(dumped).toMatch(/index_widgets_on_name/);
      expect(dumped).toMatch(/CREATE TRIGGER touch_widgets/);

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
    } finally {
      const cleanupAdapter = new BetterSQLite3Adapter(dbPath);
      await cleanupAdapter.executeMutation("DROP TABLE IF EXISTS widgets");
      await (cleanupAdapter as unknown as { close(): Promise<void> }).close();
    }
  });
});

describe("SQLiteDatabaseTasks in-memory URI variants", () => {
  withRestoredConnection();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const assertNoFsWrites = () => {
    const fsObj = getFs();
    const mkdirSpy = vi.spyOn(fsObj, "mkdirSync").mockImplementation(() => undefined);
    const writeSpy = vi.spyOn(fsObj, "writeFileSync").mockImplementation(() => undefined as any);
    const unlinkSpy = vi.spyOn(fsObj, "unlinkSync").mockImplementation(() => undefined);
    return { mkdirSpy, writeSpy, unlinkSpy };
  };

  it("creates a canonical :memory: database by connecting, writing no file", async () => {
    const { mkdirSpy, writeSpy } = assertNoFsWrites();
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: ":memory:",
    });
    await expect(new SQLiteDatabaseTasks(config).create()).resolves.toBeUndefined();
    expect(mkdirSpy).not.toHaveBeenCalled();
    expect(writeSpy).not.toHaveBeenCalled();
  });

  it("raises NoDatabaseError dropping an in-memory database, as FileUtils.rm does", async () => {
    for (const database of [
      ":memory:",
      "file::memory:?cache=shared",
      "file:memdb1?mode=memory&cache=shared",
    ]) {
      const config = new HashConfig("development", "primary", {
        adapter: "sqlite3",
        database,
      });
      await expect(new SQLiteDatabaseTasks(config).drop()).rejects.toThrow(NoDatabaseError);
    }
  });
});

describe("SQLiteDatabaseTasks in-memory structure dump", () => {
  const created: string[] = [];
  const configuration = new HashConfig("development", "primary", {
    adapter: "sqlite3",
    database: ":memory:",
  });

  let previous: ReturnType<typeof Base.removeConnection>;

  async function lay(...statements: string[]): Promise<void> {
    for (const statement of statements) await Base.adapter.executeMutation(statement);
  }

  beforeEach(async () => {
    previous = Base.removeConnection();
    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:" });
  });

  afterEach(async () => {
    SchemaDumper.ignoreTables = [];
    Base.removeConnection();
    if (previous) await Base.establishConnection(previous.configuration);
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    created.length = 0;
  });

  const sqlFile = (contents = ""): string => {
    const file = path.join(os.tmpdir(), `trails-mem-dump-${randomUUID()}.sql`);
    created.push(file);
    if (contents) fs.writeFileSync(file, contents);
    return file;
  };

  it("honors ignoreTables", async () => {
    await lay(
      "CREATE TABLE bar(id INTEGER)",
      "CREATE TABLE prefix_foo(id INTEGER)",
      "CREATE TABLE prefix_bar(id INTEGER)",
    );
    SchemaDumper.ignoreTables = [/^prefix_/g];

    const filename = sqlFile();
    await new SQLiteDatabaseTasks(configuration).structureDump(filename);

    const contents = fs.readFileSync(filename, "utf8");
    expect(contents).toMatch(/CREATE TABLE bar/);
    expect(contents).not.toMatch(/prefix_foo/);
    expect(contents).not.toMatch(/prefix_bar/);
  });

  it("dumps a trigger body whole", async () => {
    await lay(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT, updated_at TEXT)",
      "CREATE INDEX index_widgets_on_name ON widgets(name)",
      "CREATE TRIGGER touch_widgets AFTER UPDATE ON widgets " +
        "BEGIN " +
        "UPDATE widgets SET updated_at = datetime('now') WHERE id = NEW.id; " +
        "END",
    );

    const dumped = sqlFile();
    await new SQLiteDatabaseTasks(configuration).structureDump(dumped);

    const contents = fs.readFileSync(dumped, "utf8");
    expect(contents).toMatch(/CREATE TRIGGER touch_widgets/);
    expect(contents).toMatch(/UPDATE widgets SET updated_at/);
    expect(contents).toMatch(/index_widgets_on_name/);
  });

  it("leaves the live in-memory connection untouched, as Rails' child process does", async () => {
    await new SQLiteDatabaseTasks(configuration).structureLoad(
      sqlFile("CREATE TABLE widgets (id INTEGER PRIMARY KEY);\n"),
    );

    const tables = (await Base.adapter.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'",
    )) as Array<{ name: string }>;
    expect(tables).toHaveLength(0);
  });

  it("dumps an in-memory database byte-for-byte as it dumps a file-backed one", async () => {
    const schema =
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT);\n" +
      "CREATE INDEX index_widgets_on_name ON widgets(name);\n";

    await lay(
      "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)",
      "CREATE INDEX index_widgets_on_name ON widgets(name)",
    );
    const fromMemory = sqlFile();
    await new SQLiteDatabaseTasks(configuration).structureDump(fromMemory);

    const dbFile = tmpDbPath();
    created.push(dbFile);
    const fileTasks = new SQLiteDatabaseTasks(
      new HashConfig("development", "primary", { adapter: "sqlite3", database: dbFile }),
    );
    await fileTasks.structureLoad(sqlFile(schema));
    const fromFile = sqlFile();
    await fileTasks.structureDump(fromFile);

    expect(fs.readFileSync(fromMemory, "utf8")).toEqual(fs.readFileSync(fromFile, "utf8"));
    expect(fs.existsSync(`${fromMemory}.dump.sqlite3`)).toBe(false);
  });
});
