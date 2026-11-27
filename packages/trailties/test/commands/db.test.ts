import { Pathname } from "@blazetrails/ruby-compat/pathname";
import { describe, it, expect, beforeEach, afterEach, onTestFinished, vi } from "vitest";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import {
  env,
  setEnv,
  getProcessAdapter,
  registerProcessAdapter,
} from "@blazetrails/ruby-compat/process-adapter";
import { StringIO } from "@blazetrails/ruby-compat/string-io";
import { setAppPath, setEnginePath } from "../../lib/app-path.js";
import { resolveEnv } from "../../lib/database.js";
import {
  InternalMetadata,
  MigrationContext,
  Migrator,
  NullInternalMetadata,
  NullSchemaMigration,
  SchemaMigration,
  schemaFormat,
  setSchemaFormat,
} from "@blazetrails/activerecord";
import { Base, MigrationProxy } from "@blazetrails/activerecord";
import { DatabaseTasks } from "@blazetrails/activerecord/tasks/database-tasks.js";
import { Trails, _resetTrailsEnv } from "../../lib/trails.js";
import { Application } from "../../lib/application.js";
import { parse as yamlParse } from "@blazetrails/ruby-compat/psych-adapter";

function discoverMigrations(migrationsPath: string): MigrationProxy[] {
  return new MigrationContext(
    [migrationsPath],
    new NullSchemaMigration(),
    new NullInternalMetadata(),
  ).migrations;
}

function migrationContextFor(
  migrationsPath: string,
  schemaMigration: SchemaMigration,
  internalMetadata: InternalMetadata,
): MigrationContext {
  return new MigrationContext([migrationsPath], schemaMigration, internalMetadata);
}
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { lookupBang } from "../../lib/command/behavior.js";
import { DSL, Rake } from "@blazetrails/rake";
import { rbFLoad } from "@blazetrails/ruby-compat/load";
import { Configuration } from "../../lib/application/configuration.js";
import { Actions } from "../../lib/command/actions.js";
import { getPath } from "@blazetrails/ruby-compat/fs-adapter";
import { block } from "@blazetrails/ruby-compat/hash";

let seedLoads = 0;

async function runTaskLogging(task: string, logs: string[]): Promise<void> {
  const previous = getProcessAdapter();
  registerProcessAdapter({
    ...previous,
    stdout: {
      ...previous.stdout,
      write: (chunk: string) => {
        logs.push(chunk.replace(/\n$/, ""));
        return true;
      },
    },
  });
  try {
    await runTask(task);
  } finally {
    registerProcessAdapter(previous);
  }
}

async function runTask(task: string, taskVars: Record<string, string> = {}): Promise<void> {
  const vars = { TRAILS_ENV: "development", ...taskVars };
  const was = Object.fromEntries(Object.keys(vars).map((k) => [k, env[k]]));
  const seats = DatabaseTasks as unknown as Record<string, unknown>;
  const migratorPathsWas = Migrator.migrationsPaths;
  const seatsWas = ["_root", "_dbDir", "_migrationsPaths", "_seedLoader"].map(
    (k) => [k, seats[k]] as const,
  );
  for (const [k, v] of Object.entries(vars)) setEnv(k, v);
  if ("TRAILS_ENV" in taskVars) _resetTrailsEnv();
  try {
    Base.configurations(
      (await new Configuration(new Pathname(process.cwd())).databaseConfiguration()) as Parameters<
        typeof Base.configurations
      >[0],
    );
    DatabaseTasks.root = process.cwd();
    DatabaseTasks.dbDir = "db";
    DatabaseTasks.migrationsPaths = [path.join(process.cwd(), "db", "migrate")];
    DatabaseTasks.seedLoader = {
      async loadSeed() {
        const seedFile = path.join(process.cwd(), "db", "seeds.ts");
        if (fs.existsSync(seedFile)) {
          await import(`${getPath().pathToFileURL!(seedFile).href}?_t=${++seedLoads}`);
        }
      },
    };
    await Base.establishConnection();
    class DbTaskApp extends Application {}
    Application.register(DbTaskApp);
    Trails.application!.config.setRoot(process.cwd());
    await Rake.withApplication(async (rake) => {
      DSL.task(
        "environment",
        block(() => Actions.bootApplicationBang()),
      );
      await rbFLoad(
        path.resolve(import.meta.dirname, "../../../activerecord/lib/trailties/databases.ts"),
      );
      await rake.invokeTask(task);
    });
  } finally {
    for (const [k, v] of Object.entries(was)) setEnv(k, v);
    _resetTrailsEnv();
    for (const [k, v] of seatsWas) seats[k] = v;
    Trails.application = null;
    Application.appClass = null;
    Migrator.migrationsPaths = migratorPathsWas;
    await Base.connectionHandler.clearAllConnectionsBang();
  }
}

await lookupBang();

async function runTaskWithSchemaFormat(task: string, format: "ts" | "js" | "sql"): Promise<void> {
  const schemaFormatWas = schemaFormat();
  setSchemaFormat(format);
  try {
    await runTask(task);
  } finally {
    setSchemaFormat(schemaFormatWas);
  }
}

let migrationAdapters = 0;
async function establishMigrationConnection(
  adapter: unknown,
  database = ":memory:",
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { Base, HashConfig, ConnectionAdapters } = await import("@blazetrails/activerecord");
  const adapterName = `sqlite3_migration_${(migrationAdapters += 1)}`;
  const className = `SQLite3MigrationAdapter${migrationAdapters}`;
  constSet(TopLevel, className, function () {
    return adapter;
  });
  ConnectionAdapters.register(adapterName, className);
  await ConnectionAdapters.load(adapterName);
  const config = new HashConfig("test", "primary", {
    adapter: adapterName,
    database,
    ...extra,
  });
  const pool = await Base.connectionHandler.establishConnection(config, {
    ownerName: Base,
    clobber: true,
  });
  await pool.leaseConnection();
  onTestFinished(async () => {
    await Base.connectionHandler.removeConnectionPool("ActiveRecord::Base");
  });
}

beforeEach(() => {
  _resetTrailsEnv();
});

describe("resolveEnv", () => {
  const origTrailsEnv = env.TRAILS_ENV;
  const origRackEnv = env.RACK_ENV;

  afterEach(() => {
    setEnv("TRAILS_ENV", origTrailsEnv);
    setEnv("RACK_ENV", origRackEnv);
  });

  it("prefers TRAILS_ENV", () => {
    setEnv("TRAILS_ENV", "staging");
    expect(resolveEnv()).toBe("staging");
  });

  it("defaults to development", () => {
    setEnv("TRAILS_ENV", undefined);
    setEnv("RACK_ENV", undefined);
    expect(resolveEnv()).toBe("development");
  });
});

describe("discoverMigrations", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-migrations-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array for missing directory", async () => {
    const migrations = discoverMigrations(path.join(tmpDir, "nonexistent"));
    expect(migrations).toEqual([]);
  });

  it("discovers migration files and extracts versions", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "20260101000000_create_users.ts"),
      `export class CreateUsers { version = "20260101000000"; }`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "20260102000000_add_email_to_users.ts"),
      `export class AddEmailToUsers { version = "20260102000000"; }`,
    );
    fs.writeFileSync(path.join(tmpDir, "README.md"), "ignore me");

    const migrations = discoverMigrations(tmpDir);
    expect(migrations).toHaveLength(2);
    expect(migrations[0].version).toBe(20260101000000);
    expect(migrations[0].name).toBe("CreateUsers");
    expect(migrations[1].version).toBe(20260102000000);
    expect(migrations[1].name).toBe("AddEmailToUsers");
  });

  it("sorts migrations by version", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "20260202000000_second.ts"),
      `export class Second { version = "20260202000000"; }`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "20260101000000_first.ts"),
      `export class First { version = "20260101000000"; }`,
    );

    const migrations = discoverMigrations(tmpDir);
    expect(migrations[0].version).toBe(20260101000000);
    expect(migrations[1].version).toBe(20260202000000);
  });
});

describe("full migration flow", () => {
  let tmpDir: string;
  let adapter: any;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-flow-"));
  });

  afterEach(async () => {
    if (adapter && typeof adapter.close === "function") {
      await adapter.disconnectBang();
    }
    adapter = undefined;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("migrate, status, rollback with SQLite", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter({ database: ":memory:" });
    await establishMigrationConnection(adapter);

    fs.writeFileSync(
      path.join(tmpDir, "20260101000000_create_posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() {
    await this.createTable("posts", (t) => {
      t.string("title");
      t.timestamps();
    });
  }
  async down() {
    await this.dropTable("posts");
  }
}`,
    );

    const migrations = discoverMigrations(tmpDir);
    const schemaMigration = new SchemaMigration(adapter.pool);
    const internalMetadata = new InternalMetadata(adapter.pool);
    const context = migrationContextFor(tmpDir, schemaMigration, internalMetadata);
    await schemaMigration.createTable();

    const beforeStatus = await context.migrationsStatus();
    expect(beforeStatus).toHaveLength(1);
    expect(beforeStatus[0][0]).toBe("down");

    await context.migrate();

    const afterStatus = await context.migrationsStatus();
    expect(afterStatus[0][0]).toBe("up");

    const tables = (await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
    ))!;
    expect(tables).toHaveLength(1);

    await context.rollback(1);

    const rollbackStatus = await context.migrationsStatus();
    expect(rollbackStatus[0][0]).toBe("down");

    const tablesAfter = (await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
    ))!;
    expect(tablesAfter).toHaveLength(0);
  });

  it("forward moves the schema forward one migration", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter({ database: ":memory:" });
    await establishMigrationConnection(adapter);

    const a = "20260101000000_create_posts.ts";
    const b = "20260102000000_create_comments.ts";
    fs.writeFileSync(
      path.join(tmpDir, a),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, b),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateComments extends Migration.Current {
  async up() { await this.createTable("comments", (t) => { t.string("body"); }); }
  async down() { await this.dropTable("comments"); }
}`,
    );

    const migrations = discoverMigrations(tmpDir);
    const migrator = migrationContextFor(
      tmpDir,
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );

    await migrator.migrate(20260101000000);
    const posts = (await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
    ))!;
    expect(posts).toHaveLength(1);
    const commentsAfterFirst = (await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='comments'`,
    ))!;
    expect(commentsAfterFirst).toHaveLength(0);

    await migrator.forward(1);
    const commentsAfterSecond = (await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='comments'`,
    ))!;
    expect(commentsAfterSecond).toHaveLength(1);
  });

  it("currentVersion reports the highest applied version", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter({ database: ":memory:" });
    await establishMigrationConnection(adapter);

    fs.writeFileSync(
      path.join(tmpDir, "20260101000000_create_posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    const migrations = discoverMigrations(tmpDir);
    const migrator = new Migrator(
      "up",
      migrations,
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );

    expect(await migrator.currentVersion()).toBe(0);
    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(20260101000000);
  });

  it("run executes a single migration up then down by version", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter({ database: ":memory:" });
    await establishMigrationConnection(adapter);

    fs.writeFileSync(
      path.join(tmpDir, "20260101000000_create_widgets.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateWidgets extends Migration.Current {
  async up() { await this.createTable("widgets", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("widgets"); }
}`,
    );

    const context = migrationContextFor(
      tmpDir,
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );

    await context.run("up", "20260101000000");
    expect(
      await adapter.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'`),
    ).toHaveLength(1);

    await context.run("down", "20260101000000");
    expect(
      await adapter.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'`),
    ).toHaveLength(0);
  });

  it("run throws UnknownMigrationVersionError for missing versions", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const { UnknownMigrationVersionError } = await import("@blazetrails/activerecord");
    adapter = new SQLite3Adapter({ database: ":memory:" });
    await establishMigrationConnection(adapter);

    const context = migrationContextFor(
      "/nonexistent",
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );
    await expect(context.run("up", "99999999999999")).rejects.toBeInstanceOf(
      UnknownMigrationVersionError,
    );
  });

  it("pendingMigrations reflects abort_if_pending_migrations semantics", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter({ database: ":memory:" });
    await establishMigrationConnection(adapter);

    fs.writeFileSync(
      path.join(tmpDir, "20260101000000_create_posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    const context = migrationContextFor(
      tmpDir,
      new SchemaMigration(adapter.pool),
      new InternalMetadata(adapter.pool),
    );

    expect((await context.open().pendingMigrations()).length).toBe(1);
    await context.migrate();
    expect((await context.open().pendingMigrations()).length).toBe(0);
  });
});

describe("schema dump and load", () => {
  it("dumps schema from SQLite and loads it into a fresh database", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const sourceAdapter = new SQLite3Adapter({ database: ":memory:" });
    const targetAdapter = new SQLite3Adapter({ database: ":memory:" });
    try {
      await sourceAdapter.createTable("users", {}, (t) => {
        t.string("name");
        t.integer("age");
      });

      const schemaFormatWas = schemaFormat();
      setSchemaFormat("js");
      let schema: string;
      try {
        schema = (await (await sourceAdapter.createSchemaDumper({})).dump(new StringIO())).string();
      } finally {
        setSchemaFormat(schemaFormatWas);
      }
      expect(schema).toContain("users");
      expect(schema).toContain("createTable");

      const defineSchema = new Function(
        "ctx",
        schema
          .replace(/^[\s\S]*?await Schema\.get\([^\n]*\n/, "return (async () => {\n")
          .replace(/}\);\n$/, "})();"),
      );
      await defineSchema(targetAdapter);

      const tables = (await targetAdapter.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`,
      ))!;
      expect(tables).toHaveLength(1);
    } finally {
      await Promise.all([sourceAdapter.disconnectBang(), targetAdapter.disconnectBang()]);
    }
  });
});

describe("db subcommand CLI actions", { timeout: 30_000 }, () => {
  let tmpDir: string;
  let originalCwd: string;
  let logs: string[];
  let errs: string[];
  let origExitCode: typeof process.exitCode;
  const origRackEnv = env.RACK_ENV;

  beforeEach(() => {
    setEnv("RACK_ENV", undefined);
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-db-cli-"));
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "db", "migrate"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ":memory:" },
  test: { adapter: "sqlite3", database: ":memory:" },
};`,
    );
    process.chdir(tmpDir);

    logs = [];
    errs = [];
    origExitCode = process.exitCode;
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errs.push(args.map((a) => String(a)).join(" "));
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
    setEnv("RACK_ENV", origRackEnv);
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    process.exitCode = origExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function tableExists(dbFile: string, table: string): Promise<boolean> {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const adapter = new SQLite3Adapter({ database: dbFile });
    try {
      const rows = (await adapter.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
      ))!;
      return rows.length === 1;
    } finally {
      await adapter.disconnectBang();
    }
  }

  it("db version prints 0 against a fresh database", async () => {
    await runTaskLogging("db:version", logs);
    const at = logs.indexOf("Current version: 0");
    expect(at).toBeGreaterThan(0);
    expect(logs[at - 1]).toMatch(/^\ndatabase: /);
    expect(logs[at + 1]).toBe("");
  });

  it("db version reads Trails.env, not the process env", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ":memory:" },
  staging: { adapter: "sqlite3", database: "db/staging.sqlite3" },
};`,
    );
    const origTrailsEnv = env.TRAILS_ENV;
    setEnv("TRAILS_ENV", undefined);
    Trails.env = "staging";
    DatabaseTasks.env = null;
    try {
      await runTaskLogging("db:version", logs);
    } finally {
      setEnv("TRAILS_ENV", origTrailsEnv);
      _resetTrailsEnv();
      DatabaseTasks.env = null;
    }
    expect(logs.join("\n")).toMatch(/database: .*staging\.sqlite3/);
  });

  it("db abort_if_pending_migrations is a no-op when no migrations exist", async () => {
    await runTask("db:abort_if_pending_migrations");
    expect(errs).toHaveLength(0);
    expect(process.exitCode).toBeUndefined();
  });

  it("db abort_if_pending_migrations exits 1 and prints each pending", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );
    await expect(runTaskLogging("db:abort_if_pending_migrations", logs)).rejects.toThrow(
      "Run `bin/trails db:migrate` to update your database then try again.",
    );
    expect(process.exitCode).toBe(1);
    expect(logs).toContain("You have 1 pending migration:");
    expect(logs).toContain("  20260101000000 CreatePosts");
  });

  it("db version reports the highest applied version after migrate", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );
    await runTaskLogging("db:version", logs);
    expect(logs).toContain("Current version: 0");
  });

  it("db migrate:up applies the named migration and dumps schema.ts", async () => {
    const dbFile = path.join(tmpDir, "test.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    await runTask("db:migrate:up", { VERSION: "20260101000000" });

    expect(fs.existsSync(path.join(tmpDir, "db", "schema.ts"))).toBe(true);

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter({ database: dbFile });
    try {
      const tables = (await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
      ))!;
      expect(tables).toHaveLength(1);
    } finally {
      await a.disconnectBang();
    }
  });

  it("db migrate:up raises for an unknown version when no migrations exist", async () => {
    await expect(runTask("db:migrate:up", { VERSION: "20260101000000" })).rejects.toThrow(
      /No migration with version number 20260101000000/,
    );
  });

  it("db migrate --version migrates up to that version, not only that version", async () => {
    const dbFile = path.join(tmpDir, "test.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    for (const [version, table, cls] of [
      ["20260101000000", "posts", "CreatePosts"],
      ["20260101000001", "comments", "CreateComments"],
      ["20260101000002", "authors", "CreateAuthors"],
    ]) {
      fs.writeFileSync(
        path.join(tmpDir, "db", "migrate", `${version}_create_${table}.ts`),
        `import { Migration } from "@blazetrails/activerecord";
export class ${cls} extends Migration.Current {
  async up() { await this.createTable(${JSON.stringify(table)}, (t) => { t.string("title"); }); }
  async down() { await this.dropTable(${JSON.stringify(table)}); }
}`,
      );
    }

    await runTask("db:migrate", { VERSION: "20260101000001" });

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter({ database: dbFile });
    try {
      const rows = (await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name IN ('posts','comments','authors')`,
      )) as Array<{ name: string }>;
      const names = rows.map((r) => r.name).sort();
      expect(names).toEqual(["comments", "posts"]);
    } finally {
      await a.disconnectBang();
    }
  });

  it("db migrate:down reverts the named migration", async () => {
    const dbFile = path.join(tmpDir, "test.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    await runTask("db:migrate:up", { VERSION: "20260101000000" });
    await runTask("db:migrate:down", { VERSION: "20260101000000" });

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter({ database: dbFile });
    try {
      const tables = (await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
      ))!;
      expect(tables).toHaveLength(0);
    } finally {
      await a.disconnectBang();
    }
  });

  it("db migrate:up requires --version", async () => {
    await runTask("db:migrate:up").catch(() => undefined);
    expect(logs.filter((l) => l.startsWith("=="))).toHaveLength(0);
  });

  it("db environment:set stamps the schema with the current env", async () => {
    const dbFile = path.join(tmpDir, "test.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );

    await runTask("db:environment:set", { TRAILS_ENV: "test" });

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter({ database: dbFile });
    try {
      const rows = (await a.execute(
        `SELECT value FROM ar_internal_metadata WHERE key = 'environment'`,
      ))!;
      expect((rows[0] as { value: string }).value).toBe(resolveEnv());
    } finally {
      await a.disconnectBang();
    }
  });

  it("db environment:check is a no-op for non-protected environments", async () => {
    await runTask("db:check_protected_environments");
    expect(process.exitCode).toBeUndefined();
  });

  it("checkProtectedEnvironmentsBang raises when stored env is protected", async () => {
    const { InternalMetadata, ProtectedEnvironmentError, DatabaseConfigurations, HashConfig } =
      await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "prod.sqlite3");
    const adapter = new SQLite3Adapter({ database: dbFile });
    await establishMigrationConnection(adapter, dbFile);
    try {
      const internalMetadata = new InternalMetadata(adapter.pool);
      await new SchemaMigration(adapter.pool).createTable();
      await new SchemaMigration(adapter.pool).createVersion("1");
      await internalMetadata.createTable();
      await internalMetadata.set("environment", "production");
    } finally {
      await adapter.disconnectBang();
    }

    const configurations = new DatabaseConfigurations([
      new HashConfig("production", "primary", { adapter: "sqlite3", database: dbFile }),
    ]);
    const previous = Base.configurations();
    Base.configurations(configurations);
    try {
      await expect(
        DatabaseTasks.checkProtectedEnvironmentsBang("production"),
      ).rejects.toBeInstanceOf(ProtectedEnvironmentError);
    } finally {
      Base.configurations(previous);
    }
  });

  it("checkProtectedEnvironmentsBang raises EnvironmentMismatchError when stored != current", async () => {
    const { InternalMetadata, EnvironmentMismatchError, DatabaseConfigurations, HashConfig } =
      await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "staging.sqlite3");
    const adapter = new SQLite3Adapter({ database: dbFile });
    await establishMigrationConnection(adapter, dbFile);
    try {
      const internalMetadata = new InternalMetadata(adapter.pool);
      await new SchemaMigration(adapter.pool).createTable();
      await new SchemaMigration(adapter.pool).createVersion("1");
      await internalMetadata.createTable();
      await internalMetadata.set("environment", "staging");
    } finally {
      await adapter.disconnectBang();
    }

    const configurations = new DatabaseConfigurations([
      new HashConfig("development", "primary", { adapter: "sqlite3", database: dbFile }),
    ]);
    const previous = Base.configurations();
    Base.configurations(configurations);
    try {
      const error = await DatabaseTasks.checkProtectedEnvironmentsBang("development").catch(
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(EnvironmentMismatchError);
      expect((error as Error).message).toMatch(
        new RegExp(`        bin/trails db:environment:set TRAILS_ENV=${Trails.env}\n\n$`),
      );
    } finally {
      Base.configurations(previous);
    }
  });

  it("DISABLE_DATABASE_ENVIRONMENT_CHECK bypasses the check", async () => {
    const { InternalMetadata, DatabaseConfigurations, HashConfig } =
      await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "prod2.sqlite3");
    const adapter = new SQLite3Adapter({ database: dbFile });
    await establishMigrationConnection(adapter, dbFile);
    try {
      const internalMetadata = new InternalMetadata(adapter.pool);
      await new SchemaMigration(adapter.pool).createTable();
      await new SchemaMigration(adapter.pool).createVersion("1");
      await internalMetadata.createTable();
      await internalMetadata.set("environment", "production");
    } finally {
      await adapter.disconnectBang();
    }

    const configurations = new DatabaseConfigurations([
      new HashConfig("production", "primary", { adapter: "sqlite3", database: dbFile }),
    ]);
    const previous = Base.configurations();
    const origEnv = process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
    Base.configurations(configurations);
    process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = "1";
    try {
      await expect(
        DatabaseTasks.checkProtectedEnvironmentsBang("production"),
      ).resolves.toBeUndefined();
    } finally {
      Base.configurations(previous);
      if (origEnv === undefined) delete process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
      else process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = origEnv;
    }
  });

  it("MigrationContext.protectedEnvironment is read-only and false on fresh DB", async () => {
    const { MigrationContext, InternalMetadata, Base } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "fresh.sqlite3");
    const adapter = new SQLite3Adapter({ database: dbFile });
    await establishMigrationConnection(adapter, dbFile);
    const previousProtected = Base.protectedEnvironments;
    Base.protectedEnvironments = ["production"];
    try {
      const internalMetadata = new InternalMetadata(adapter.pool);
      const context = new MigrationContext([], new SchemaMigration(adapter.pool), internalMetadata);
      expect(await context.protectedEnvironment()).toBeNull();

      expect(await internalMetadata.tableExists()).toBe(false);

      await new SchemaMigration(adapter.pool).createTable();
      await new SchemaMigration(adapter.pool).createVersion("1");
      await internalMetadata.createTable();
      await internalMetadata.set("environment", "production");
      expect(await context.protectedEnvironment()).toBe(true);
    } finally {
      Base.protectedEnvironments = previousProtected;
      await adapter.disconnectBang();
    }
  });

  async function disableMetadataTable(adapter: unknown, database?: string): Promise<void> {
    const { Base } = await import("@blazetrails/activerecord");
    await Base.connectionHandler.removeConnectionPool("ActiveRecord::Base");
    await establishMigrationConnection(adapter, database, { useMetadataTable: false });
  }

  it("InternalMetadata with enabled=false skips set writes", async () => {
    const { InternalMetadata } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "disabled.sqlite3");
    const adapter = new SQLite3Adapter({ database: dbFile });
    await establishMigrationConnection(adapter, dbFile);
    try {
      await disableMetadataTable(adapter, dbFile);
      const disabledMeta = new InternalMetadata(adapter.pool);
      expect(disabledMeta.enabled).toBe(false);

      await expect(disabledMeta.createTable()).resolves.toBeUndefined();
      await expect(disabledMeta.createTableAndSetFlags("production")).resolves.toBeUndefined();
      expect(await disabledMeta.tableExists()).toBe(false);

      await expect(disabledMeta.set("environment", "test")).resolves.toBeUndefined();
    } finally {
      await adapter.disconnectBang();
    }
  });

  it("Migrator with internalMetadataEnabled=false migrates without stamping", async () => {
    const { Migration, Migrator, MigrationContext, InternalMetadata } =
      await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "no-metadata-migrate.sqlite3");
    const adapter = new SQLite3Adapter({ database: dbFile });
    await establishMigrationConnection(adapter);
    try {
      const createWidgets = new MigrationProxy("CreateWidgets", 20260101000000, "", "");
      createWidgets.migration = async () =>
        new (class extends Migration.Current {
          override async up(): Promise<void> {
            await (
              await this.connection
            ).execute(`CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)`);
          }
          override async down(): Promise<void> {
            await (await this.connection).execute(`DROP TABLE widgets`);
          }
        })("CreateWidgets", 20260101000000);
      const migrations = [createWidgets];
      await disableMetadataTable(adapter);
      const migrator = new Migrator(
        "up",
        migrations,
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
      );

      await expect(migrator.migrate()).resolves.toEqual(expect.any(Array));

      const tables = (await adapter.execute(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )) as Array<{ name: string }>;
      const names = tables.map((t) => t.name);
      expect(names).toContain("widgets");
      expect(names).not.toContain("ar_internal_metadata");

      const context = new MigrationContext(
        [],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
      );
      expect(await context.lastStoredEnvironment()).toBeNull();
    } finally {
      await adapter.disconnectBang();
    }
  });

  it("lastStoredEnvironment returns null when metadata is disabled even if table exists", async () => {
    const { MigrationContext, InternalMetadata } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "stale-metadata.sqlite3");
    const adapter = new SQLite3Adapter({ database: dbFile });
    await establishMigrationConnection(adapter, dbFile);
    try {
      const enabledMeta = new InternalMetadata(adapter.pool);
      await enabledMeta.createTable();
      await enabledMeta.set("environment", "production");
      await disableMetadataTable(adapter, dbFile);

      const context = new MigrationContext(
        [],
        new SchemaMigration(adapter.pool),
        new InternalMetadata(adapter.pool),
      );
      expect(await context.lastStoredEnvironment()).toBeNull();
      expect(await context.protectedEnvironment()).toBeNull();
    } finally {
      await adapter.disconnectBang();
    }
  });

  it("DatabaseTasks.truncateTables deletes user tables but keeps schema_migrations + ar_internal_metadata", async () => {
    const { InternalMetadata, HashConfig: HC } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "truncate.sqlite3");
    const seedAdapter = new SQLite3Adapter({ database: dbFile });
    await establishMigrationConnection(seedAdapter, dbFile);
    try {
      await seedAdapter.execute("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)");
      await seedAdapter.execute("INSERT INTO posts (title) VALUES ('a'), ('b')");
      await new InternalMetadata(seedAdapter.pool).createTableAndSetFlags("development");
      await seedAdapter.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR NOT NULL PRIMARY KEY)",
      );
      await seedAdapter.execute(
        "INSERT INTO schema_migrations (version) VALUES ('20260101000000')",
      );
    } finally {
      await seedAdapter.disconnectBang();
    }

    const config = new HC("development", "primary", {
      adapter: "sqlite3",
      database: dbFile,
    });
    const { Base } = await import("@blazetrails/activerecord");
    await Base.establishConnection({ adapter: "sqlite3", database: dbFile });
    try {
      await DatabaseTasks.truncateTables(config);
    } finally {
      await Base.removeConnection();
    }

    const verify = new SQLite3Adapter({ database: dbFile });
    try {
      const postsCount = (await verify.execute(`SELECT COUNT(*) AS c FROM posts`)) as Array<{
        c: number;
      }>;
      expect(Number(postsCount[0].c)).toBe(0);

      const schemaCount = (await verify.execute(
        `SELECT COUNT(*) AS c FROM schema_migrations`,
      )) as Array<{ c: number }>;
      expect(Number(schemaCount[0].c)).toBe(1);

      const metaCount = (await verify.execute(
        `SELECT COUNT(*) AS c FROM ar_internal_metadata WHERE key = 'environment'`,
      )) as Array<{ c: number }>;
      expect(Number(metaCount[0].c)).toBe(1);
    } finally {
      await verify.disconnectBang();
    }
  });

  it("db truncate_all empties user tables", async () => {
    const dbFile = path.join(tmpDir, "cli-truncate.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const seed = new SQLite3Adapter({ database: dbFile });
    try {
      await seed.execute("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
      await seed.execute("INSERT INTO widgets (name) VALUES ('x'), ('y')");
    } finally {
      await seed.disconnectBang();
    }

    await runTask("db:truncate_all");
    expect(process.exitCode).toBeUndefined();

    const verify = new SQLite3Adapter({ database: dbFile });
    try {
      const rows = (await verify.execute(`SELECT COUNT(*) AS c FROM widgets`)) as Array<{
        c: number;
      }>;
      expect(Number(rows[0].c)).toBe(0);
    } finally {
      await verify.disconnectBang();
    }
  });

  it("db prepare creates, migrates, and seeds a fresh database", async () => {
    const dbFile = path.join(tmpDir, "prepare.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_widgets.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateWidgets extends Migration.Current {
  async up() { await this.createTable("widgets", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("widgets"); }
}`,
    );
    const seedMarker = path.join(tmpDir, "db", "seeds-ran");
    fs.writeFileSync(
      path.join(tmpDir, "db", "seeds.ts"),
      `import * as fs from "node:fs";
fs.writeFileSync(${JSON.stringify(seedMarker)}, "ran");`,
    );

    expect(fs.existsSync(dbFile)).toBe(false);
    await runTask("db:prepare");
    expect(fs.existsSync(dbFile)).toBe(true);
    expect(fs.existsSync(seedMarker)).toBe(true);

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter({ database: dbFile });
    try {
      const tables = (await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'`,
      ))!;
      expect(tables).toHaveLength(1);
    } finally {
      await a.disconnectBang();
    }
  });

  it("db prepare honors per-environment migrationsPaths", async () => {
    const devDb = path.join(tmpDir, "per-env-dev.sqlite3");
    const testDb = path.join(tmpDir, "per-env-test.sqlite3");
    fs.mkdirSync(path.join(tmpDir, "db", "migrations_test_env"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(devDb)} },
  test: {
    adapter: "sqlite3",
    database: ${JSON.stringify(testDb)},
    migrationsPaths: "db/migrations_test_env",
  },
};`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrations_test_env", "20260101000001_create_fixtures.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateFixtures extends Migration.Current {
  async up() { await this.createTable("fixtures", (t) => { t.string("label"); }); }
  async down() { await this.dropTable("fixtures"); }
}`,
    );

    await runTask("db:prepare");

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const dev = new SQLite3Adapter({ database: devDb });
    try {
      expect(
        await dev.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'"),
      ).toHaveLength(1);
      expect(
        await dev.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='fixtures'"),
      ).toHaveLength(0);
    } finally {
      await dev.disconnectBang();
    }
    const test = new SQLite3Adapter({ database: testDb });
    try {
      expect(
        await test.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='fixtures'"),
      ).toHaveLength(1);
      expect(
        await test.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'"),
      ).toHaveLength(0);
    } finally {
      await test.disconnectBang();
    }
  });

  it("db seed:replant truncates tables then runs seeds", async () => {
    const dbFile = path.join(tmpDir, "replant.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    const seedMarker = path.join(tmpDir, "db", "seed-count");
    fs.writeFileSync(
      path.join(tmpDir, "db", "seeds.ts"),
      `import * as fs from "node:fs";
const prev = fs.existsSync(${JSON.stringify(seedMarker)})
  ? Number(fs.readFileSync(${JSON.stringify(seedMarker)}, "utf8"))
  : 0;
fs.writeFileSync(${JSON.stringify(seedMarker)}, String(prev + 1));`,
    );

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const seed = new SQLite3Adapter({ database: dbFile });
    try {
      await seed.execute("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
      await seed.execute("INSERT INTO widgets (name) VALUES ('keep-me')");
    } finally {
      await seed.disconnectBang();
    }

    await runTask("db:seed:replant");
    expect(fs.readFileSync(seedMarker, "utf8")).toBe("1");

    const verify = new SQLite3Adapter({ database: dbFile });
    try {
      const rows = (await verify.execute(`SELECT COUNT(*) AS c FROM widgets`)) as Array<{
        c: number;
      }>;
      expect(Number(rows[0].c)).toBe(0);
    } finally {
      await verify.disconnectBang();
    }
  });

  it("db schema:cache:dump writes a populated schema_cache.json", async () => {
    const dbFile = path.join(tmpDir, "cache.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const seed = new SQLite3Adapter({ database: dbFile });
    try {
      await seed.execute("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)");
    } finally {
      await seed.disconnectBang();
    }

    await runTask("db:schema:cache:dump");

    const cachePath = path.join(tmpDir, "db", "schema_cache.yml");
    expect(fs.existsSync(cachePath)).toBe(true);
    const parsed = yamlParse(fs.readFileSync(cachePath, "utf8"), { maxAliasCount: -1 }) as {
      columns: Record<string, unknown[]>;
      data_sources: Record<string, boolean>;
    };
    expect(Object.keys(parsed.columns)).toContain("widgets");
    expect(parsed.data_sources["widgets"]).toBe(true);
  });

  it("db schema:cache:clear deletes the schema_cache.json file", async () => {
    const cachePath = path.join(tmpDir, "db", "schema_cache.yml");
    fs.writeFileSync(cachePath, "{}");
    expect(fs.existsSync(cachePath)).toBe(true);

    await runTask("db:schema:cache:clear");

    expect(fs.existsSync(cachePath)).toBe(false);
  });

  it("db schema:cache:clear is a no-op when no cache file exists", async () => {
    const cachePath = path.join(tmpDir, "db", "schema_cache.yml");
    expect(fs.existsSync(cachePath)).toBe(false);
    await runTask("db:schema:cache:clear");
    expect(errs).toHaveLength(0);
    expect(logs.find((l) => l.includes("Cleared schema cache"))).toBeUndefined();
  });

  it("db schema:cache:dump captures user-created indexes", async () => {
    const dbFile = path.join(tmpDir, "idx.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const seed = new SQLite3Adapter({ database: dbFile });
    try {
      await seed.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)");
      await seed.execute("CREATE UNIQUE INDEX users_on_email ON users (email)");
    } finally {
      await seed.disconnectBang();
    }

    await runTask("db:schema:cache:dump");

    const cachePath = path.join(tmpDir, "db", "schema_cache.yml");
    const parsed = yamlParse(fs.readFileSync(cachePath, "utf8"), { maxAliasCount: -1 }) as {
      indexes: Record<
        string,
        Array<{ table: string; name: string; columns: string[]; unique: boolean }>
      >;
    };
    expect(parsed.indexes["users"]).toEqual([
      {
        table: "users",
        name: "users_on_email",
        columns: ["email"],
        unique: true,
        where: null,
        orders: {},
        lengths: {},
        opclasses: {},
        type: null,
        using: null,
        include: null,
        nulls_not_distinct: null,
        comment: null,
        valid: true,
        algorithm: null,
        if_not_exists: null,
      },
    ]);
  });

  it("leaves no connection open after the command finishes", async () => {
    const dbFile = path.join(tmpDir, "primary.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );

    await runTask("db:create");

    const { Base } = await import("@blazetrails/activerecord");
    const connected = Base.connectionHandler
      .connectionPoolList()
      .filter((pool) => pool.isConnected());

    expect(connected.map((pool) => String(pool.dbConfig.database))).toEqual([]);
  });

  it("db create + migrate fans out across every multi-DB config", async () => {
    const primaryDb = path.join(tmpDir, "primary.sqlite3");
    const animalsDb = path.join(tmpDir, "animals.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    fs.mkdirSync(path.join(tmpDir, "db", "migrate_animals"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000001_create_dogs.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateDogs extends Migration.Current {
  async up() { await this.createTable("dogs", (t) => { t.string("breed"); }); }
  async down() { await this.dropTable("dogs"); }
}`,
    );

    await runTask("db:create");
    expect(fs.existsSync(primaryDb)).toBe(true);
    expect(fs.existsSync(animalsDb)).toBe(true);

    await runTask("db:migrate");

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const pAdapter = new SQLite3Adapter({ database: primaryDb });
    try {
      const users = (await pAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
      ))!;
      expect(users).toHaveLength(1);
      const noDogs = (await pAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dogs'",
      ))!;
      expect(noDogs).toHaveLength(0);
    } finally {
      await pAdapter.disconnectBang();
    }
    const aAdapter = new SQLite3Adapter({ database: animalsDb });
    try {
      const dogs = (await aAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dogs'",
      ))!;
      expect(dogs).toHaveLength(1);
      const noUsers = (await aAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
      ))!;
      expect(noUsers).toHaveLength(0);
    } finally {
      await aAdapter.disconnectBang();
    }

    const primarySchema = path.join(tmpDir, "db", "schema.ts");
    const animalsSchema = path.join(tmpDir, "db", "animals_schema.ts");
    expect(fs.existsSync(primarySchema)).toBe(true);
    expect(fs.existsSync(animalsSchema)).toBe(true);
    expect(fs.readFileSync(primarySchema, "utf8")).toContain("users");
    expect(fs.readFileSync(animalsSchema, "utf8")).toContain("dogs");
  });

  it("db forward and db migrate:redo step the named database", async () => {
    const primaryDb = path.join(tmpDir, "forward-primary.sqlite3");
    const animalsDb = path.join(tmpDir, "forward-animals.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    fs.mkdirSync(path.join(tmpDir, "db", "migrate_animals"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000001_create_dogs.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateDogs extends Migration.Current {
  async up() { await this.createTable("dogs", (t) => { t.string("breed"); }); }
  async down() { await this.dropTable("dogs"); }
}`,
    );

    await runTask("db:create");
    await runTask("db:migrate");
    await runTask("db:rollback:primary");
    await runTask("db:rollback:animals");
    expect(await tableExists(primaryDb, "users")).toBe(false);
    expect(await tableExists(animalsDb, "dogs")).toBe(false);

    await runTask("db:forward");
    expect(await tableExists(primaryDb, "users")).toBe(true);
    expect(await tableExists(animalsDb, "dogs")).toBe(false);

    await runTask("db:migrate:animals");
    expect(await tableExists(animalsDb, "dogs")).toBe(true);

    await runTask("db:migrate:redo:animals");
    expect(await tableExists(animalsDb, "dogs")).toBe(true);
    expect(await tableExists(primaryDb, "users")).toBe(true);
  });

  it("db migrate --database=animals targets only the named DB", async () => {
    const primaryDb = path.join(tmpDir, "primary2.sqlite3");
    const animalsDb = path.join(tmpDir, "animals2.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    fs.mkdirSync(path.join(tmpDir, "db", "migrate_animals"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000001_create_dogs.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateDogs extends Migration.Current {
  async up() { await this.createTable("dogs", (t) => { t.string("breed"); }); }
  async down() { await this.dropTable("dogs"); }
}`,
    );

    await runTask("db:create");
    await runTask("db:migrate:animals");

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const pAdapter = new SQLite3Adapter({ database: primaryDb });
    try {
      const users = (await pAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'",
      ))!;
      expect(users).toHaveLength(0);
    } finally {
      await pAdapter.disconnectBang();
    }
    const aAdapter = new SQLite3Adapter({ database: animalsDb });
    try {
      const dogs = (await aAdapter.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='dogs'",
      ))!;
      expect(dogs).toHaveLength(1);
    } finally {
      await aAdapter.disconnectBang();
    }
  });

  it("db migrate respects migrationsPaths config override", async () => {
    const primaryDb = path.join(tmpDir, "mp-primary.sqlite3");
    const animalsDb = path.join(tmpDir, "mp-animals.sqlite3");
    const customDir = "custom/animal_migrations";
    fs.mkdirSync(path.join(tmpDir, customDir), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: ${JSON.stringify(customDir)} },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: ${JSON.stringify(customDir)} },
  },
};`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, customDir, "20260101000001_create_cats.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateCats extends Migration.Current {
  async up() { await this.createTable("cats", (t) => { t.string("breed"); }); }
  async down() { await this.dropTable("cats"); }
}`,
    );

    await runTask("db:create");
    await runTask("db:migrate:animals");

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter({ database: animalsDb });
    try {
      const cats = (await a.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cats'",
      ))!;
      expect(cats).toHaveLength(1);
    } finally {
      await a.disconnectBang();
    }
  });

  it("db schema:cache:dump fans out across every multi-DB config", async () => {
    const primaryDb = path.join(tmpDir, "primary.sqlite3");
    const animalsDb = path.join(tmpDir, "animals.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
  test: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb)} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb)}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const seedPrimary = new SQLite3Adapter({ database: primaryDb });
    try {
      await seedPrimary.execute("CREATE TABLE widgets (id INTEGER PRIMARY KEY)");
    } finally {
      await seedPrimary.disconnectBang();
    }
    const seedAnimals = new SQLite3Adapter({ database: animalsDb });
    try {
      await seedAnimals.execute("CREATE TABLE dogs (id INTEGER PRIMARY KEY)");
    } finally {
      await seedAnimals.disconnectBang();
    }

    await runTask("db:schema:cache:dump");

    const primaryCache = yamlParse(
      fs.readFileSync(path.join(tmpDir, "db", "schema_cache.yml"), "utf8"),
      { maxAliasCount: -1 },
    ) as { columns: Record<string, unknown[]> };
    const animalsCache = yamlParse(
      fs.readFileSync(path.join(tmpDir, "db", "animals_schema_cache.yml"), "utf8"),
      { maxAliasCount: -1 },
    ) as { columns: Record<string, unknown[]> };
    expect(Object.keys(primaryCache.columns)).toContain("widgets");
    expect(Object.keys(animalsCache.columns)).toContain("dogs");
  });

  it("db schema:dump --format=sql writes db/structure.sql", async () => {
    const dbFile = path.join(tmpDir, "fmt.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const seed = new SQLite3Adapter({ database: dbFile });
    try {
      await seed.execute("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
    } finally {
      await seed.disconnectBang();
    }

    await runTask("db:schema:dump", { SCHEMA_FORMAT: "sql" });

    expect(fs.existsSync(path.join(tmpDir, "db", "structure.sql"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "db", "schema.ts"))).toBe(false);
    const dumped = fs.readFileSync(path.join(tmpDir, "db", "structure.sql"), "utf8");
    expect(dumped).toContain("CREATE TABLE widgets");
  });

  it("db schema:load --format=sql replays structure.sql end-to-end", async () => {
    const dbFile = path.join(tmpDir, "roundtrip.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const seed = new SQLite3Adapter({ database: dbFile });
    try {
      await seed.execute("CREATE TABLE gadgets (id INTEGER PRIMARY KEY, label TEXT NOT NULL)");
      await seed.execute("CREATE INDEX gadgets_on_label ON gadgets (label)");
    } finally {
      await seed.disconnectBang();
    }

    await runTask("db:schema:dump", { SCHEMA_FORMAT: "sql" });
    expect(fs.existsSync(path.join(tmpDir, "db", "structure.sql"))).toBe(true);

    const dropper = new SQLite3Adapter({ database: dbFile });
    try {
      await dropper.execute("DROP TABLE gadgets");
    } finally {
      await dropper.disconnectBang();
    }

    await runTaskWithSchemaFormat("db:schema:load", "sql");

    const verify = new SQLite3Adapter({ database: dbFile });
    try {
      const tables = (await verify.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='gadgets'",
      )) as Array<{ name: string }>;
      expect(tables).toHaveLength(1);
      const indexes = (await verify.execute(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='gadgets_on_label'",
      )) as Array<{ name: string }>;
      expect(indexes).toHaveLength(1);
    } finally {
      await verify.disconnectBang();
    }
  });

  it("post-migrate schema dump honors config.schemaFormat=sql", async () => {
    const dbFile = path.join(tmpDir, "migrate-fmt.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_things.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateThings extends Migration.Current {
  async up() { await this.createTable("things", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("things"); }
}`,
    );

    const schemaFormatWas = schemaFormat();
    setSchemaFormat("sql");
    try {
      await runTask("db:migrate:up", { VERSION: "20260101000000" });
    } finally {
      setSchemaFormat(schemaFormatWas);
    }

    expect(fs.existsSync(path.join(tmpDir, "db", "structure.sql"))).toBe(true);
    expect(fs.existsSync(path.join(tmpDir, "db", "schema.ts"))).toBe(false);
    const dumped = fs.readFileSync(path.join(tmpDir, "db", "structure.sql"), "utf8");
    expect(dumped).toContain("things");
  });

  it("db schema:dump --format=sql appends schema_migrations versions", async () => {
    const dbFile = path.join(tmpDir, "migrations-dump.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration.Current {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    await runTask("db:migrate");
    await runTask("db:schema:dump", { SCHEMA_FORMAT: "sql" });

    const dumped = fs.readFileSync(path.join(tmpDir, "db", "structure.sql"), "utf8");
    expect(dumped).toMatch(/INSERT INTO "schema_migrations"/);
    expect(dumped).toContain("20260101000000");

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const dropper = new SQLite3Adapter({ database: dbFile });
    try {
      await dropper.execute("DROP TABLE schema_migrations");
      await dropper.execute("DROP TABLE ar_internal_metadata");
      await dropper.execute("DROP TABLE posts");
    } finally {
      await dropper.disconnectBang();
    }

    await runTaskWithSchemaFormat("db:schema:load", "sql");

    const verify = new SQLite3Adapter({ database: dbFile });
    try {
      const rows = (await verify.execute(
        "SELECT version FROM schema_migrations ORDER BY version",
      )) as Array<{ version: string }>;
      expect(rows.map((r) => r.version)).toEqual(["20260101000000"]);
    } finally {
      await verify.disconnectBang();
    }
  });

  it("db schema:load --format=sql errors when structure.sql is missing", async () => {
    const dbFile = path.join(tmpDir, "missing.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    await new (
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js")
    ).SQLite3Adapter({ database: dbFile }).disconnectBang();

    await expect(runTaskWithSchemaFormat("db:schema:load", "sql")).rejects.toThrow(
      "db/structure.sql doesn't exist yet. Run `bin/trails db:migrate` to create it, then try again.",
    );
    expect(process.exitCode).toBe(1);
  });
});

describe("db command multi-database parity", { timeout: 30_000 }, () => {
  let tmpDir: string;
  let originalCwd: string;
  let logs: string[];
  let stdout: string;
  let previousProcessAdapter: ReturnType<typeof getProcessAdapter>;
  const origRackEnv = env.RACK_ENV;
  const primaryDb = () => path.join(tmpDir, "primary.sqlite3");
  const animalsDb = () => path.join(tmpDir, "animals.sqlite3");

  function writeTwoDatabaseConfig(): void {
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb())} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(animalsDb())}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
  }

  function writeMigrations(): void {
    fs.mkdirSync(path.join(tmpDir, "db", "migrate_animals"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate", "20260101000000_create_users.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateUsers extends Migration.Current {
  async up() { await this.createTable("users", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("users"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrate_animals", "20260101000001_create_dogs.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateDogs extends Migration.Current {
  async up() { await this.createTable("dogs", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("dogs"); }
}`,
    );
  }

  function writeCountingSeedFile(): string {
    const marker = path.join(tmpDir, "seed-loads.txt");
    fs.writeFileSync(
      path.join(tmpDir, "db", "seeds.ts"),
      `import * as fs from "node:fs";
fs.appendFileSync(${JSON.stringify(marker)}, "loaded\\n");`,
    );
    return marker;
  }

  function seedLoadCount(marker: string): number {
    if (!fs.existsSync(marker)) return 0;
    return fs.readFileSync(marker, "utf8").trim().split("\n").filter(Boolean).length;
  }

  beforeEach(() => {
    setEnv("RACK_ENV", undefined);
    setEnv("TRAILS_ENV", "development");
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-db-multi-"));
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "db", "migrate"), { recursive: true });
    process.chdir(tmpDir);
    logs = [];
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    });
    stdout = "";
    previousProcessAdapter = getProcessAdapter();
    registerProcessAdapter({
      ...previousProcessAdapter,
      stdout: {
        ...previousProcessAdapter.stdout,
        write: (chunk: string) => {
          stdout += chunk;
          return true;
        },
      },
    });
  });

  afterEach(async () => {
    registerProcessAdapter(previousProcessAdapter);
    setEnv("RACK_ENV", origRackEnv);
    setEnv("TRAILS_ENV", undefined);
    setAppPath(undefined);
    setEnginePath(undefined);
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    const { Base } = await import("@blazetrails/activerecord");
    await Base.connectionHandler.clearAllConnectionsBang();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("db seed loads db/seeds.ts once with two databases configured", async () => {
    writeTwoDatabaseConfig();
    writeMigrations();
    const marker = writeCountingSeedFile();
    await runTask("db:migrate");

    await runTask("db:seed");

    expect(seedLoadCount(marker)).toBe(1);
  });

  it("db seed loads the application before the seed file, so initializers have run", async () => {
    writeTwoDatabaseConfig();
    writeMigrations();
    const bootMarker = path.join(tmpDir, "booted.txt");
    fs.writeFileSync(
      path.join(tmpDir, "boot.ts"),
      `import * as fs from "node:fs";
fs.writeFileSync(${JSON.stringify(bootMarker)}, "booted");`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "seeds.ts"),
      `import * as fs from "node:fs";
if (!fs.existsSync(${JSON.stringify(bootMarker)})) {
  throw new Error("seeds.ts ran before the application was loaded");
}`,
    );
    setEnginePath(path.join(tmpDir, "boot.ts"));
    await runTask("db:migrate");

    await runTask("db:seed");

    expect(fs.existsSync(bootMarker)).toBe(true);
  });

  it("db seed runs the initializers when there is no seed file", async () => {
    writeTwoDatabaseConfig();
    writeMigrations();
    const bootMarker = path.join(tmpDir, "booted.txt");
    fs.writeFileSync(
      path.join(tmpDir, "boot.ts"),
      `import * as fs from "node:fs";
fs.writeFileSync(${JSON.stringify(bootMarker)}, "booted");`,
    );
    setEnginePath(path.join(tmpDir, "boot.ts"));
    await runTask("db:migrate");

    await runTask("db:seed");

    expect(fs.existsSync(bootMarker)).toBe(true);
  });

  it("db seed reaches a model on the second database through the connection an initializer established, and closes it", async () => {
    writeTwoDatabaseConfig();
    writeMigrations();
    fs.writeFileSync(
      path.join(tmpDir, "boot.ts"),
      `import { Base } from "@blazetrails/activerecord";
class AnimalsRecord extends Base {
  static { this.abstractClass = true; }
}
class Dog extends AnimalsRecord {
  static { this.tableName = "dogs"; }
}
await AnimalsRecord.establishConnection({ adapter: "sqlite3", database: ${JSON.stringify(animalsDb())} });
(globalThis as any).__dbSeedDog = Dog;`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "seeds.ts"),
      `await (globalThis as any).__dbSeedDog.create({ name: "Rex" });`,
    );
    setEnginePath(path.join(tmpDir, "boot.ts"));
    await runTask("db:migrate");

    await runTask("db:seed");

    const Dog = (globalThis as { __dbSeedDog?: unknown }).__dbSeedDog;
    delete (globalThis as { __dbSeedDog?: unknown }).__dbSeedDog;
    expect(Dog).toBeDefined();
    expect(await rowCountIn(animalsDb(), "dogs")).toBe(1);
    expect(await tableIn(primaryDb(), "dogs")).toBe(false);
    const { Base } = await import("@blazetrails/activerecord");
    expect(Base.connectionHandler.connectionPools.filter((pool) => pool.isConnected())).toEqual([]);
  });

  it("db migrate names each migration it runs and does not claim to be up to date", async () => {
    writeTwoDatabaseConfig();
    writeMigrations();

    await runTask("db:migrate");

    expect(stdout).toMatch(/^== 20260101000000 CreateUsers: migrating/m);
    expect(stdout).toMatch(/^== 20260101000001 CreateDogs: migrating/m);
    expect(logs.some((l) => l.includes("All migrations are up to date."))).toBe(false);
  });

  it("db migrate creates a database that does not exist and does not claim to be up to date", async () => {
    const storage = path.join(tmpDir, "storage");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(path.join(storage, "primary.sqlite3"))} },
    animals: { adapter: "sqlite3", database: ${JSON.stringify(path.join(storage, "animals.sqlite3"))}, migrationsPaths: "db/migrate_animals" },
  },
};`,
    );
    writeMigrations();

    await runTask("db:migrate");

    expect(stdout).toMatch(/^== 20260101000000 CreateUsers: migrated/m);
    expect(stdout).toMatch(/^== 20260101000001 CreateDogs: migrated/m);
    expect(logs.some((l) => l.includes("All migrations are up to date."))).toBe(false);
    expect(await tableIn(path.join(storage, "animals.sqlite3"), "dogs")).toBe(true);
  });

  it("db migrate reports loading the schema into an empty database, naming the file", async () => {
    writeTwoDatabaseConfig();
    writeMigrations();
    await runTask("db:migrate");
    fs.rmSync(primaryDb());
    fs.rmSync(animalsDb());
    logs.length = 0;

    await runTask("db:migrate");

    expect(await tableIn(primaryDb(), "users")).toBe(true);
    expect(await tableIn(animalsDb(), "dogs")).toBe(true);
  });

  async function tableIn(dbFile: string, table: string): Promise<boolean> {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const adapter = new SQLite3Adapter({ database: dbFile });
    try {
      const rows = (await adapter.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='${table}'`,
      ))!;
      return rows.length === 1;
    } finally {
      await adapter.disconnectBang();
    }
  }

  async function rowCountIn(dbFile: string, table: string): Promise<number> {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const adapter = new SQLite3Adapter({ database: dbFile });
    try {
      return (await adapter.execute(`SELECT * FROM ${table}`))!.length;
    } finally {
      await adapter.disconnectBang();
    }
  }

  const pgLane = process.env.ARCONN === "postgresql";
  const pgUrl = (database: string): string => {
    const host = process.env.PGHOST ?? "localhost";
    const port = process.env.PGPORT ?? "5432";
    const user = process.env.PGUSER ?? "postgres";
    return `postgres://${user}@${host}:${port}/${database}`;
  };

  it.skipIf(!pgLane)(
    "db drop drops a Postgres database configured by url, and create follows it in one process",
    async () => {
      const dbName = `trails_db_drop_${process.pid}`;
      fs.writeFileSync(
        path.join(tmpDir, "config", "database.ts"),
        `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb())} },
    hub: { url: ${JSON.stringify(pgUrl(dbName))}, migrationsPaths: "db/migrate_hub" },
  },
};`,
      );
      fs.mkdirSync(path.join(tmpDir, "db", "migrate_hub"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "db", "migrate_hub", "20260101000002_create_owners.ts"),
        `import { Migration } from "@blazetrails/activerecord";
export class CreateOwners extends Migration.Current {
  async up() { await this.createTable("owners", (t) => { t.string("login"); }); }
  async down() { await this.dropTable("owners"); }
}`,
      );

      await runTask("db:create");
      await runTask("db:drop");
      await runTask("db:create");
      await runTask("db:migrate");

      expect(stdout).toContain(`Dropped database '${dbName}'`);
      expect(stdout).toContain(`Created database '${dbName}'`);
      expect(stdout).toMatch(/== 20260101000002 CreateOwners: migrated/);
      await runTask("db:drop");
      await runTask("db:drop");
      expect(process.exitCode ?? 0).toBe(0);
    },
  );

  it.skipIf(!pgLane)(
    "db migrate creates an absent Postgres database and runs its migrations",
    async () => {
      const dbName = `trails_db_absent_${process.pid}`;
      fs.writeFileSync(
        path.join(tmpDir, "config", "database.ts"),
        `export default {
  development: {
    primary: { adapter: "sqlite3", database: ${JSON.stringify(primaryDb())} },
    hub: { url: ${JSON.stringify(pgUrl(dbName))}, migrationsPaths: "db/migrate_hub" },
  },
};`,
      );
      fs.mkdirSync(path.join(tmpDir, "db", "migrate_hub"), { recursive: true });
      fs.writeFileSync(
        path.join(tmpDir, "db", "migrate_hub", "20260101000003_create_hub_owners.ts"),
        `import { Migration } from "@blazetrails/activerecord";
export class CreateHubOwners extends Migration.Current {
  async up() { await this.createTable("hub_owners", (t) => { t.string("login"); }); }
  async down() { await this.dropTable("hub_owners"); }
}`,
      );
      await runTask("db:drop");
      stdout = "";
      logs.length = 0;

      await runTask("db:migrate");

      expect(stdout).toMatch(/== 20260101000003 CreateHubOwners: migrated/);
      expect(logs.some((l) => l.includes("All migrations are up to date."))).toBe(false);
      expect(`${stdout}${logs.join("\n")}`).not.toContain("Loaded schema from");
      await runTask("db:drop");
      expect(process.exitCode ?? 0).toBe(0);
    },
  );

  it("db drop drops a SQLite database, which has no maintenance connection", async () => {
    writeTwoDatabaseConfig();
    writeMigrations();
    await runTask("db:migrate");
    expect(fs.existsSync(primaryDb())).toBe(true);

    await runTask("db:drop");

    expect(fs.existsSync(primaryDb())).toBe(false);
    expect(fs.existsSync(animalsDb())).toBe(false);
  });
});
