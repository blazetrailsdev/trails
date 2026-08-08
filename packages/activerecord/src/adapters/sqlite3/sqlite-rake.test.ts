/**
 * Mirrors Rails activerecord/test/cases/adapters/sqlite3/sqlite_rake_test.rb.
 *
 * Despite the file name nothing here drives Rake: every test calls
 * `ActiveRecord::Tasks::DatabaseTasks` directly, which is why the structure
 * dump/load classes port straight across.
 */
import { it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { randomUUID } from "node:crypto";
import * as activesupport from "@blazetrails/activesupport";
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

/** Rails seeds these fixtures with backticked `sqlite3` calls. */
function runSqlite3(database: string, sql: string): void {
  const result = activesupport.getChildProcess().spawnSync("sqlite3", [database, sql]);
  if (result.status !== 0) throw new Error(`sqlite3 failed: ${result.stderr}`);
}

describeIfSqlite("SqliteDBCreateTest", () => {
  it.skip("db checks database exists", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with(File, :exist?)`.
  });
  it.skip("when db created successfully outputs info to stdout", () => {
    // Not yet ported: asserts on the `$stdout` StringIO the setup swaps in.
  });
  it.skip("db create when file exists", () => {
    // Not yet ported: asserts on the `$stderr` StringIO the setup swaps in.
  });
  it.skip("db create with file does nothing", () => {
    // Not yet ported: asserts through Ruby's `assert_not_called`.
  });
  it.skip("db create establishes a connection", () => {
    // Not yet ported: stubs `Base.establish_connection` to collect its args.
  });
  it.skip("db create with error prints message", () => {
    // Not yet ported: asserts on the `$stderr` StringIO the setup swaps in.
  });
});

describeIfSqlite("SqliteDBDropTest", () => {
  it.skip("checks db dir is absolute", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with(File, :absolute_path?)`.
  });
  it.skip("removes file with absolute path", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with(FileUtils, :rm)`.
  });
  it.skip("generates absolute path with given root", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with(File, :join)`.
  });
  it.skip("removes file with relative path", () => {
    // Not yet ported: asserts through Ruby's `assert_called_with(FileUtils, :rm)`.
  });
  it.skip("when db dropped successfully outputs info to stdout", () => {
    // Not yet ported: asserts on the `$stdout` StringIO the setup swaps in.
  });
});

describeIfSqlite("SqliteDBCharsetTest", () => {
  it.skip("db retrieves charset", () => {
    // Not yet ported: asserts through Ruby's `assert_called(@connection, :encoding)`.
  });
});

describeIfSqlite("SqliteDBCollationTest", () => {
  it.skip("db retrieves collation", () => {
    // Not yet ported: asserts `DatabaseTasks.collation` raises NoMethodError,
    // which is Ruby's answer to a task class that defines no `collation`.
  });
});

describeIfSqlite("SqliteStructureDumpTest", () => {
  const created: string[] = [];
  let database: string;
  let configuration: HashConfig;

  // `structure_dump` reads `data_sources` off the ambient connection, so the
  // fixture database has to be the established one. Rails stubs the call
  // instead (`sqlite_rake_test.rb:195`) because its `Base` is pinned to arunit;
  // establishing keeps the assertion lane-independent.
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
    // `with_structure_dump_flags`' ensure (`sqlite_rake_test.rb:238-239`).
    DatabaseTasks.structureDumpFlags = previousFlags;
    SchemaDumper.ignoreTables = [];
    Base.removeConnection();
    if (previous) await Base.establishConnection(previous.configuration);
    for (const file of created) {
      try {
        fs.unlinkSync(file);
      } catch {
        // ignore
      }
    }
    created.length = 0;
  });

  it("structure dump", async () => {
    const dbfile = database;
    const filename = awesomeFile();
    created.push(filename);

    await DatabaseTasks.structureDump(configuration, filename);

    expect(fs.existsSync(dbfile)).toBeTruthy();
    expect(fs.existsSync(filename)).toBeTruthy();
    expect(fs.readFileSync(filename, "utf8")).toMatch(/CREATE TABLE foo/);
    expect(fs.readFileSync(filename, "utf8")).toMatch(/CREATE TABLE bar/);
  });

  it("structure dump with ignore tables", async () => {
    const dbfile = database;
    const filename = awesomeFile();
    created.push(filename);
    // Rails stubs `data_sources` to add these two (`sqlite_rake_test.rb:195`);
    // trails' structureDump reads the list off the live connection, so they
    // have to exist for the ignore patterns to have anything to match.
    runSqlite3(database, "CREATE TABLE prefix_foo(id INTEGER)");
    runSqlite3(database, "CREATE TABLE ignored_foo(id INTEGER)");
    SchemaDumper.ignoreTables = [/^prefix_/, "ignored_foo"];

    await DatabaseTasks.structureDump(configuration, filename);

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

    // Rails pins the argv through `assert_called_with(Kernel, :system, ...)`;
    // `runCmd` builds the same argv and hands it to the child-process adapter,
    // which is where the spy sits.
    const childProcess = await activesupport.getChildProcessAsync();
    const spawnSync = vi.spyOn(childProcess, "spawnSync");

    let message = "";
    DatabaseTasks.structureDumpFlags = ["--noop"];
    await expect(
      DatabaseTasks.structureDump(configuration, filename).catch((e: Error) => {
        message = e.message;
        throw e;
      }),
    ).rejects.toThrow();

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
      } catch {
        // ignore
      }
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
    await DatabaseTasks.structureLoad(configuration, filename);

    expect(fs.existsSync(dbfile)).toBeTruthy();
  });
});
