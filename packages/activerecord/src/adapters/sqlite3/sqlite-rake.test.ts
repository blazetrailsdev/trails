import { it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import * as activesupport from "@blazetrails/activesupport";
import { stdout, stderr } from "@blazetrails/activesupport";
import { NoMethodError } from "@blazetrails/activemodel";
import { describeIfSqlite } from "../../support/describe-if-sqlite.js";
import { DatabaseTasks } from "../../tasks/database-tasks.js";
import { SQLiteDatabaseTasks } from "../../tasks/sqlite-database-tasks.js";
import { HashConfig } from "../../database-configurations/hash-config.js";
import { SchemaDumper } from "../../schema-dumper.js";
import { Base } from "../../base.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `db_create-${randomUUID()}.sqlite3`);
}

function awesomeFile(): string {
  return path.join(os.tmpdir(), `awesome-file-${randomUUID()}.sql`);
}

function runSqlite3(database: string, sql: string): void {
  const result = activesupport.getChildProcess().spawnSync("sqlite3", [database, sql]);
  if (result.status !== 0) throw new Error(`sqlite3 failed: ${result.stderr}`);
}

function captureStreams(): { out: () => string; err: () => string } {
  let outString = "";
  let errString = "";
  vi.spyOn(stdout, "write").mockImplementation((chunk) => {
    outString += String(chunk);
    return true;
  });
  vi.spyOn(stderr, "write").mockImplementation((chunk) => {
    errString += String(chunk);
    return true;
  });
  return { out: () => outString, err: () => errString };
}

describeIfSqlite("SqliteDBCreateTest", () => {
  const database = "db_create.sqlite3";
  let configuration: HashConfig;
  let streams: ReturnType<typeof captureStreams>;

  beforeEach(() => {
    configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });
    SQLiteDatabaseTasks.register();
    streams = captureStreams();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("db checks database exists", async () => {
    vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined as never);
    const existsSync = vi.spyOn(activesupport.getFs(), "existsSync").mockReturnValue(false);

    await DatabaseTasks.create(configuration);

    expect(existsSync).toHaveBeenCalledWith(database);
  });

  it("when db created successfully outputs info to stdout", async () => {
    vi.spyOn(Base, "establishConnection").mockResolvedValue(undefined as never);
    vi.spyOn(activesupport.getFs(), "existsSync").mockReturnValue(false);

    await DatabaseTasks.create(configuration);

    expect(streams.out()).toEqual(`Created database '${database}'\n`);
  });

  it("db create when file exists", async () => {
    vi.spyOn(activesupport.getFs(), "existsSync").mockReturnValue(true);

    await DatabaseTasks.create(configuration);

    expect(streams.err()).toEqual(`Database '${database}' already exists\n`);
  });

  it("db create with file does nothing", async () => {
    vi.spyOn(activesupport.getFs(), "existsSync").mockReturnValue(true);
    const establishConnection = vi.spyOn(Base, "establishConnection");

    await DatabaseTasks.create(configuration);

    expect(establishConnection).not.toHaveBeenCalled();
  });

  it("db create establishes a connection", async () => {
    const calls: unknown[][] = [];
    vi.spyOn(Base, "establishConnection").mockImplementation(async (...args: unknown[]) => {
      calls.push(args);
      return undefined as never;
    });
    vi.spyOn(activesupport.getFs(), "existsSync").mockReturnValue(false);

    await DatabaseTasks.create(configuration);

    expect(calls.map((c) => (c[0] as HashConfig).configurationHash)).toEqual([
      configuration.configurationHash,
    ]);
  });

  it("db create with error prints message", async () => {
    vi.spyOn(activesupport.getFs(), "existsSync").mockReturnValue(false);
    vi.spyOn(Base, "establishConnection").mockImplementation(() => {
      throw new Error("boom");
    });

    await expect(DatabaseTasks.create(configuration)).rejects.toThrow(Error);
    expect(streams.err()).toMatch(
      `Couldn't create '${database}' database. Please check your configuration.`,
    );
  });
});

describeIfSqlite("SqliteDBDropTest", () => {
  const root = "/rails/root";
  const database = "db_create.sqlite3";
  const databaseRoot = `${root}/${database}`;
  let configuration: HashConfig;
  let configurationRoot: HashConfig;
  let streams: ReturnType<typeof captureStreams>;
  let previousRoot: string;

  beforeEach(() => {
    configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });
    configurationRoot = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: databaseRoot,
    });
    SQLiteDatabaseTasks.register();
    previousRoot = DatabaseTasks.root;
    DatabaseTasks.root = root;
    streams = captureStreams();
  });

  afterEach(() => {
    DatabaseTasks.root = previousRoot;
    vi.restoreAllMocks();
  });

  it("checks db dir is absolute", async () => {
    const pathAdapter = activesupport.getPath() as { isAbsolute(p: string): boolean };
    const isAbsolute = vi.spyOn(pathAdapter, "isAbsolute").mockReturnValue(false);
    vi.spyOn(activesupport.getFs(), "unlinkSync").mockImplementation(() => undefined);

    await DatabaseTasks.drop(configuration);

    expect(isAbsolute).toHaveBeenCalledWith(database);
  });

  it("removes file with absolute path", async () => {
    const unlinkSync = vi
      .spyOn(activesupport.getFs(), "unlinkSync")
      .mockImplementation(() => undefined);

    await DatabaseTasks.drop(configurationRoot);

    expect(unlinkSync).toHaveBeenCalledWith(databaseRoot);
    expect(unlinkSync).toHaveBeenCalledWith(`${databaseRoot}-shm`);
    expect(unlinkSync).toHaveBeenCalledWith(`${databaseRoot}-wal`);
  });

  it("generates absolute path with given root", async () => {
    const join = vi.spyOn(activesupport.getPath(), "join");
    vi.spyOn(activesupport.getFs(), "unlinkSync").mockImplementation(() => undefined);

    await DatabaseTasks.drop(configuration);

    expect(join).toHaveBeenCalledWith(root, database);
    expect(join).toHaveReturnedWith(`${root}/${database}`);
  });

  it("removes file with relative path", async () => {
    const unlinkSync = vi
      .spyOn(activesupport.getFs(), "unlinkSync")
      .mockImplementation(() => undefined);

    await DatabaseTasks.drop(configuration);

    expect(unlinkSync).toHaveBeenCalledWith(databaseRoot);
    expect(unlinkSync).toHaveBeenCalledWith(`${databaseRoot}-shm`);
    expect(unlinkSync).toHaveBeenCalledWith(`${databaseRoot}-wal`);
  });

  it("when db dropped successfully outputs info to stdout", async () => {
    vi.spyOn(activesupport.getFs(), "unlinkSync").mockImplementation(() => undefined);

    await DatabaseTasks.drop(configuration);

    expect(streams.out()).toEqual(`Dropped database '${database}'\n`);
  });
});

describeIfSqlite("SqliteDBCharsetTest", () => {
  const database = "db_create.sqlite3";
  let configuration: HashConfig;

  beforeEach(() => {
    configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });
    SQLiteDatabaseTasks.register();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("db retrieves charset", async () => {
    const connection = await Base.connectionPool().leaseConnection();
    const encoding = vi.spyOn(connection as unknown as { encoding: string }, "encoding", "get");

    await DatabaseTasks.charset(configuration);

    expect(encoding).toHaveBeenCalled();
  });
});

describeIfSqlite("SqliteDBCollationTest", () => {
  const database = "db_create.sqlite3";
  let configuration: HashConfig;

  beforeEach(() => {
    configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });
    SQLiteDatabaseTasks.register();
  });

  it("db retrieves collation", async () => {
    await expect(DatabaseTasks.collation(configuration)).rejects.toBeInstanceOf(NoMethodError);
  });
});

describeIfSqlite("SqliteStructureDumpTest", () => {
  const created: string[] = [];
  let database: string;
  let configuration: HashConfig;

  let previous: ReturnType<typeof Base.removeConnection>;
  let previousFlags: typeof DatabaseTasks.structureDumpFlags;

  beforeEach(async () => {
    database = tmpDbPath();
    created.push(database);
    runSqlite3(database, "CREATE TABLE bar(id INTEGER)");
    runSqlite3(database, "CREATE TABLE foo(id INTEGER)");
    configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database,
    });
    previous = Base.removeConnection();
    await Base.establishConnection({ adapter: "sqlite3", database });
    previousFlags = DatabaseTasks.structureDumpFlags;
    SQLiteDatabaseTasks.register();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    DatabaseTasks.structureDumpFlags = previousFlags;
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

  it("structure dump", async () => {
    const dbfile = database;
    const filename = awesomeFile();
    created.push(filename);

    await DatabaseTasks.structureDump(configuration, filename, "/rails/root");

    expect(fs.existsSync(dbfile)).toBeTruthy();
    expect(fs.existsSync(filename)).toBeTruthy();
    expect(fs.readFileSync(filename, "utf8")).toMatch(/CREATE TABLE foo/);
    expect(fs.readFileSync(filename, "utf8")).toMatch(/CREATE TABLE bar/);
  });

  it("structure dump with ignore tables", async () => {
    const dbfile = database;
    const filename = awesomeFile();
    created.push(filename);
    runSqlite3(database, "CREATE TABLE prefix_foo(id INTEGER)");
    runSqlite3(database, "CREATE TABLE ignored_foo(id INTEGER)");
    SchemaDumper.ignoreTables = [/^prefix_/, "ignored_foo"];

    await DatabaseTasks.structureDump(configuration, filename, "/rails/root");

    expect(fs.existsSync(dbfile)).toBeTruthy();
    expect(fs.existsSync(filename)).toBeTruthy();
    const contents = fs.readFileSync(filename, "utf8");
    expect(contents).toMatch(/bar/);
    expect(contents).not.toMatch(/prefix_foo/);
    expect(contents).not.toMatch(/ignored_foo/);
  });

  it("structure dump execution fails", async () => {
    const filename = awesomeFile();
    created.push(filename);

    const childProcess = await activesupport.getChildProcessAsync();
    const spawnSync = vi.spyOn(childProcess, "spawnSync");

    let message = "";
    DatabaseTasks.structureDumpFlags = ["--noop"];
    await expect(
      DatabaseTasks.structureDump(configuration, filename, "/rails/root").catch((e: Error) => {
        message = e.message;
        throw e;
      }),
    ).rejects.toThrow(Error);

    expect(spawnSync).toHaveBeenCalledWith(
      "sqlite3",
      ["--noop", database, ".schema --nosys"],
      expect.objectContaining({ out: filename }),
    );
    expect(message).toMatch("failed to execute:");
  });
});

describeIfSqlite("SqliteStructureLoadTest", () => {
  const created: string[] = [];

  beforeEach(() => {
    SQLiteDatabaseTasks.register();
  });

  afterEach(() => {
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {}
    }
    created.length = 0;
  });

  it("structure load", async () => {
    const dbfile = tmpDbPath();
    const filename = awesomeFile();
    created.push(dbfile, filename);
    const configuration = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: dbfile,
    });

    fs.writeFileSync(filename, "select datetime('now', 'localtime');\n");
    await DatabaseTasks.structureLoad(configuration, filename, "/rails/root");

    expect(fs.existsSync(dbfile)).toBeTruthy();
  });
});
