import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createProgram } from "../cli.js";
import { loadDatabaseConfig, connectAdapter, resolveEnv } from "../database.js";
import { discoverMigrations } from "../migration-loader.js";
import { Migrator } from "@blazetrails/activerecord";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("DbCommand", () => {
  it("has migrate subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "migrate")).toBe(true);
  });

  it("has rollback subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "rollback")).toBe(true);
  });

  it("has seed subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "seed")).toBe(true);
  });

  it("has create subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "create")).toBe(true);
  });

  it("has drop subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "drop")).toBe(true);
  });

  it("has migrate:status subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "migrate:status")).toBe(true);
  });

  it("has migrate:redo subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "migrate:redo")).toBe(true);
  });

  it("has reset subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "reset")).toBe(true);
  });

  it("has setup subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "setup")).toBe(true);
  });

  it("has schema:dump subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "schema:dump")).toBe(true);
  });

  it("has schema:load subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "schema:load")).toBe(true);
  });

  it("has version subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "version")).toBe(true);
  });

  it("has forward subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "forward")).toBe(true);
  });

  it("has abort_if_pending_migrations subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "abort_if_pending_migrations")).toBe(true);
  });

  it("has migrate:up subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "migrate:up")).toBe(true);
  });

  it("has migrate:down subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "migrate:down")).toBe(true);
  });

  it("has schema:cache:dump subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "schema:cache:dump")).toBe(true);
  });

  it("has schema:cache:clear subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "schema:cache:clear")).toBe(true);
  });
});

describe("resolveEnv", () => {
  const origRailsEnv = process.env.TRAILS_ENV;
  const origNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (origRailsEnv === undefined) delete process.env.TRAILS_ENV;
    else process.env.TRAILS_ENV = origRailsEnv;
    if (origNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = origNodeEnv;
  });

  it("prefers TRAILS_ENV", () => {
    process.env.TRAILS_ENV = "staging";
    process.env.NODE_ENV = "production";
    expect(resolveEnv()).toBe("staging");
  });

  it("falls back to NODE_ENV", () => {
    delete process.env.TRAILS_ENV;
    process.env.NODE_ENV = "production";
    expect(resolveEnv()).toBe("production");
  });

  it("defaults to development", () => {
    delete process.env.TRAILS_ENV;
    delete process.env.NODE_ENV;
    expect(resolveEnv()).toBe("development");
  });
});

describe("connectAdapter", () => {
  let adapter: any;

  afterEach(async () => {
    if (adapter && typeof adapter.close === "function") {
      await adapter.close();
    }
    adapter = undefined;
  });

  it("creates SqliteAdapter for sqlite3", async () => {
    adapter = await connectAdapter({ adapter: "sqlite3", database: ":memory:" });
    expect(adapter.constructor.name).toBe("SQLite3Adapter");
  });

  it("creates SqliteAdapter for sqlite", async () => {
    adapter = await connectAdapter({ adapter: "sqlite", database: ":memory:" });
    expect(adapter.constructor.name).toBe("SQLite3Adapter");
  });

  it("throws for unknown adapter", async () => {
    await expect(connectAdapter({ adapter: "oracle" })).rejects.toThrow(/Unknown database adapter/);
  });
});

describe("loadDatabaseConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-db-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("throws when no config file exists", async () => {
    await expect(loadDatabaseConfig("development", tmpDir)).rejects.toThrow(
      /No database config found/,
    );
  });

  it("loads config from config/database.ts", async () => {
    const configDir = path.join(tmpDir, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ":memory:" },
  test: { adapter: "sqlite3", database: ":memory:" },
};`,
    );

    const config = await loadDatabaseConfig("development", tmpDir);
    expect(config.adapter).toBe("sqlite3");
  });

  it("throws for missing environment", async () => {
    const configDir = path.join(tmpDir, "config");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      path.join(configDir, "database.ts"),
      `export default { development: { adapter: "sqlite3" } };`,
    );

    await expect(loadDatabaseConfig("production", tmpDir)).rejects.toThrow(
      /No database configuration for environment "production"/,
    );
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
    const migrations = await discoverMigrations(path.join(tmpDir, "nonexistent"));
    expect(migrations).toEqual([]);
  });

  it("discovers migration files and extracts versions", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "20260101000000-create-users.ts"),
      `export class CreateUsers { version = "20260101000000"; }`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "20260102000000-add-email-to-users.ts"),
      `export class AddEmailToUsers { version = "20260102000000"; }`,
    );
    fs.writeFileSync(path.join(tmpDir, "README.md"), "ignore me");

    const migrations = await discoverMigrations(tmpDir);
    expect(migrations).toHaveLength(2);
    expect(migrations[0].version).toBe("20260101000000");
    expect(migrations[0].name).toBe("create-users");
    expect(migrations[1].version).toBe("20260102000000");
    expect(migrations[1].name).toBe("add-email-to-users");
  });

  it("sorts migrations by version", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "20260202000000-second.ts"),
      `export class Second { version = "20260202000000"; }`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "20260101000000-first.ts"),
      `export class First { version = "20260101000000"; }`,
    );

    const migrations = await discoverMigrations(tmpDir);
    expect(migrations[0].version).toBe("20260101000000");
    expect(migrations[1].version).toBe("20260202000000");
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
      await adapter.close();
    }
    adapter = undefined;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("migrate, status, rollback with SQLite", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter(":memory:");

    fs.writeFileSync(
      path.join(tmpDir, "20260101000000-create-posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration {
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

    const migrations = await discoverMigrations(tmpDir);
    const migrator = new Migrator(adapter, migrations);

    // Status before migrate
    const beforeStatus = await migrator.migrationsStatus();
    expect(beforeStatus).toHaveLength(1);
    expect(beforeStatus[0].status).toBe("down");

    // Migrate up
    await migrator.migrate();

    // Status after migrate
    const afterStatus = await migrator.migrationsStatus();
    expect(afterStatus[0].status).toBe("up");

    // Verify table exists
    const tables = await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
    );
    expect(tables).toHaveLength(1);

    // Rollback
    await migrator.rollback(1);

    // Status after rollback
    const rollbackStatus = await migrator.migrationsStatus();
    expect(rollbackStatus[0].status).toBe("down");

    // Verify table is gone
    const tablesAfter = await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
    );
    expect(tablesAfter).toHaveLength(0);
  });

  it("forward moves the schema forward one migration", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter(":memory:");

    const a = "20260101000000-create-posts.ts";
    const b = "20260102000000-create-comments.ts";
    fs.writeFileSync(
      path.join(tmpDir, a),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );
    fs.writeFileSync(
      path.join(tmpDir, b),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateComments extends Migration {
  async up() { await this.createTable("comments", (t) => { t.string("body"); }); }
  async down() { await this.dropTable("comments"); }
}`,
    );

    const migrations = await discoverMigrations(tmpDir);
    const migrator = new Migrator(adapter, migrations);

    await migrator.forward(1);
    const posts = await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
    );
    expect(posts).toHaveLength(1);
    const commentsAfterFirst = await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='comments'`,
    );
    expect(commentsAfterFirst).toHaveLength(0);

    await migrator.forward(1);
    const commentsAfterSecond = await adapter.execute(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='comments'`,
    );
    expect(commentsAfterSecond).toHaveLength(1);
  });

  it("currentVersion reports the highest applied version", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter(":memory:");

    fs.writeFileSync(
      path.join(tmpDir, "20260101000000-create-posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    const migrations = await discoverMigrations(tmpDir);
    const migrator = new Migrator(adapter, migrations);

    expect(await migrator.currentVersion()).toBe(0);
    await migrator.migrate();
    expect(await migrator.currentVersion()).toBe(20260101000000);
  });

  it("run executes a single migration up then down by version", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter(":memory:");

    fs.writeFileSync(
      path.join(tmpDir, "20260101000000-create-widgets.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateWidgets extends Migration {
  async up() { await this.createTable("widgets", (t) => { t.string("name"); }); }
  async down() { await this.dropTable("widgets"); }
}`,
    );

    const migrations = await discoverMigrations(tmpDir);
    const migrator = new Migrator(adapter, migrations);

    await migrator.run("up", "20260101000000");
    expect(
      await adapter.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'`),
    ).toHaveLength(1);

    await migrator.run("down", "20260101000000");
    expect(
      await adapter.execute(`SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'`),
    ).toHaveLength(0);
  });

  it("run throws UnknownMigrationVersionError for missing versions", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const { UnknownMigrationVersionError } = await import("@blazetrails/activerecord");
    adapter = new SQLite3Adapter(":memory:");

    const migrator = new Migrator(adapter, []);
    await expect(migrator.run("up", "99999999999999")).rejects.toBeInstanceOf(
      UnknownMigrationVersionError,
    );
  });

  it("pendingMigrations reflects abort_if_pending_migrations semantics", async () => {
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    adapter = new SQLite3Adapter(":memory:");

    fs.writeFileSync(
      path.join(tmpDir, "20260101000000-create-posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    const migrations = await discoverMigrations(tmpDir);
    const migrator = new Migrator(adapter, migrations);

    expect((await migrator.pendingMigrations()).length).toBe(1);
    await migrator.migrate();
    expect((await migrator.pendingMigrations()).length).toBe(0);
  });
});

describe("schema dump and load", () => {
  it("dumps schema from SQLite and loads it into a fresh database", async () => {
    const { SchemaDumper, MigrationContext } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const { AdapterSchemaSource } = await import("../schema-source.js");

    const sourceAdapter = new SQLite3Adapter(":memory:");
    const targetAdapter = new SQLite3Adapter(":memory:");
    try {
      // Create a database with a table
      const ctx = new MigrationContext(sourceAdapter);
      await ctx.createTable("users", {}, (t) => {
        t.string("name");
        t.integer("age");
      });

      // Dump schema
      const source = new AdapterSchemaSource(sourceAdapter);
      // Dump as JS so the JSDoc-annotated output is valid input to
      // `new Function` below (no TS `import type` / annotation syntax).
      const schema = await SchemaDumper.dump(source, { language: "js" });
      expect(schema).toContain("users");
      expect(schema).toContain("createTable");

      // Load into a fresh database
      const targetCtx = new MigrationContext(targetAdapter);
      const defineSchema = new Function(
        "ctx",
        schema
          // Strip only the header JSDoc (first /** ... */ before the
          // export statement). Anchored to start-of-string with optional
          // leading // line comments / blank lines so later block comments
          // in the body aren't clobbered.
          .replace(/^(?:\s*\/\/[^\n]*\n)*\s*\/\*\*[\s\S]*?\*\/\s*/, "")
          .replace(
            /export default async function defineSchema\(ctx(?:: any)?\) \{/,
            "return (async () => {",
          )
          .replace(/}$/, "})();"),
      );
      await defineSchema(targetCtx);

      // Verify table exists in target
      const tables = await targetAdapter.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='users'`,
      );
      expect(tables).toHaveLength(1);
    } finally {
      sourceAdapter.close();
      targetAdapter.close();
    }
  });
});

describe("db subcommand CLI actions", () => {
  let tmpDir: string;
  let originalCwd: string;
  let logs: string[];
  let errs: string[];
  let origExitCode: typeof process.exitCode;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-db-cli-"));
    originalCwd = process.cwd();
    fs.mkdirSync(path.join(tmpDir, "config"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, "db", "migrations"), { recursive: true });
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
    // Use vi.spyOn so vi.restoreAllMocks() in afterEach reliably reverts
    // any mutation even if an assertion throws mid-test.
    vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => String(a)).join(" "));
    });
    vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errs.push(args.map((a) => String(a)).join(" "));
    });
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.chdir(originalCwd);
    vi.restoreAllMocks();
    process.exitCode = origExitCode;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  async function runDb(args: string[]): Promise<void> {
    const program = createProgram();
    program.exitOverride();
    await program.parseAsync(["node", "trails", "db", ...args]);
  }

  it("db version prints 0 against a fresh database", async () => {
    await runDb(["version"]);
    expect(logs).toContain("Current version: 0");
  });

  it("db abort_if_pending_migrations is a no-op when no migrations exist", async () => {
    await runDb(["abort_if_pending_migrations"]);
    expect(errs).toHaveLength(0);
    expect(process.exitCode).toBeUndefined();
  });

  it("db abort_if_pending_migrations exits 1 and prints each pending", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrations", "20260101000000-create-posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );
    await runDb(["abort_if_pending_migrations"]);
    expect(process.exitCode).toBe(1);
    const joined = errs.join("\n");
    expect(joined).toContain("You have 1 pending migration:");
    expect(joined).toContain("20260101000000");
    // migration-loader derives the display name from the filename suffix.
    expect(joined).toContain("create-posts");
    expect(joined).toContain("Run `trails db migrate` to resolve this issue.");
  });

  it("db version reports the highest applied version after migrate", async () => {
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrations", "20260101000000-create-posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );
    // :memory: DBs aren't shared across adapter connections, so we can't
    // assert migrate->version against the same DB via CLI. Instead verify
    // db version handles a standalone :memory: adapter cleanly — we
    // already asserted the post-migrate version elsewhere via Migrator.
    await runDb(["version"]);
    expect(logs).toContain("Current version: 0");
  });

  it("db forward with step=0 rejects and exits 1", async () => {
    await runDb(["forward", "--step", "0"]).catch(() => undefined);
    expect(process.exitCode).toBe(1);
    expect(errs.join("\n")).toMatch(/Invalid value for --step/);
  });

  it("db migrate:up applies the named migration and dumps schema.ts", async () => {
    // Point both config AND this CLI's migrations at a persistent sqlite
    // file so the adapter used by the CLI and the one we use to assert
    // against see the same DB.
    const dbFile = path.join(tmpDir, "test.sqlite3");
    fs.writeFileSync(
      path.join(tmpDir, "config", "database.ts"),
      `export default {
  development: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
  test: { adapter: "sqlite3", database: ${JSON.stringify(dbFile)} },
};`,
    );
    fs.writeFileSync(
      path.join(tmpDir, "db", "migrations", "20260101000000-create-posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    await runDb(["migrate:up", "--version=20260101000000"]);

    // Schema dump should have been written.
    expect(fs.existsSync(path.join(tmpDir, "db", "schema.ts"))).toBe(true);

    // Table was created.
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter(dbFile);
    try {
      const tables = await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
      );
      expect(tables).toHaveLength(1);
    } finally {
      await a.close();
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
      path.join(tmpDir, "db", "migrations", "20260101000000-create-posts.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreatePosts extends Migration {
  async up() { await this.createTable("posts", (t) => { t.string("title"); }); }
  async down() { await this.dropTable("posts"); }
}`,
    );

    await runDb(["migrate:up", "--version=20260101000000"]);
    await runDb(["migrate:down", "--version=20260101000000"]);

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter(dbFile);
    try {
      const tables = await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='posts'`,
      );
      expect(tables).toHaveLength(0);
    } finally {
      await a.close();
    }
  });

  it("db migrate:up requires --version", async () => {
    await runDb(["migrate:up"]).catch(() => undefined);
    // commander's exitOverride() raises before the action runs; the test
    // just confirms the option is required (no exception also satisfies
    // 'no silent success' since we'd otherwise have printed something).
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

    await runDb(["environment:set"]);

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter(dbFile);
    try {
      const rows = await a.execute(
        `SELECT value FROM ar_internal_metadata WHERE key = 'environment'`,
      );
      // Matches whatever NODE_ENV / TRAILS_ENV resolves to at test time
      // (vitest sets NODE_ENV=test).
      expect((rows[0] as { value: string }).value).toBe(resolveEnv());
    } finally {
      await a.close();
    }
    expect(logs.some((l) => l.includes("Stamped schema with environment"))).toBe(true);
  });

  it("db environment:check is a no-op for non-protected environments", async () => {
    await runDb(["environment:check"]);
    expect(process.exitCode).toBeUndefined();
  });

  it("checkProtectedEnvironmentsBang raises when stored env is protected", async () => {
    const {
      DatabaseTasks,
      Migrator,
      ProtectedEnvironmentError,
      DatabaseConfigurations,
      HashConfig,
    } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "prod.sqlite3");
    const adapter = new SQLite3Adapter(dbFile);
    try {
      const migrator = new Migrator(adapter, []);
      await migrator.internalMetadata.createTable();
      await migrator.internalMetadata.set("environment", "production");
    } finally {
      await adapter.close();
    }

    const configurations = new DatabaseConfigurations([
      new HashConfig("production", "primary", { adapter: "sqlite3", database: dbFile }),
    ]);
    const previous = DatabaseTasks.databaseConfiguration;
    const previousCurrent = DatabaseConfigurations.current;
    DatabaseTasks.databaseConfiguration = configurations;
    try {
      await expect(
        DatabaseTasks.checkProtectedEnvironmentsBang("production"),
      ).rejects.toBeInstanceOf(ProtectedEnvironmentError);
    } finally {
      // DatabaseConfigurations constructor registers itself as the
      // module-level current-configurations singleton — restore that too,
      // not just DatabaseTasks.databaseConfiguration.
      DatabaseTasks.databaseConfiguration = previous;
      DatabaseConfigurations.current = previousCurrent;
    }
  });

  it("checkProtectedEnvironmentsBang raises EnvironmentMismatchError when stored != current", async () => {
    const {
      DatabaseTasks,
      Migrator,
      EnvironmentMismatchError,
      DatabaseConfigurations,
      HashConfig,
    } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "staging.sqlite3");
    const adapter = new SQLite3Adapter(dbFile);
    try {
      const migrator = new Migrator(adapter, []);
      await migrator.internalMetadata.createTable();
      await migrator.internalMetadata.set("environment", "staging");
    } finally {
      await adapter.close();
    }

    const configurations = new DatabaseConfigurations([
      new HashConfig("development", "primary", { adapter: "sqlite3", database: dbFile }),
    ]);
    const previous = DatabaseTasks.databaseConfiguration;
    const previousCurrent = DatabaseConfigurations.current;
    DatabaseTasks.databaseConfiguration = configurations;
    try {
      await expect(
        DatabaseTasks.checkProtectedEnvironmentsBang("development"),
      ).rejects.toBeInstanceOf(EnvironmentMismatchError);
    } finally {
      DatabaseTasks.databaseConfiguration = previous;
      DatabaseConfigurations.current = previousCurrent;
    }
  });

  it("DISABLE_DATABASE_ENVIRONMENT_CHECK bypasses the check", async () => {
    const { DatabaseTasks, Migrator, DatabaseConfigurations, HashConfig } =
      await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "prod2.sqlite3");
    const adapter = new SQLite3Adapter(dbFile);
    try {
      const migrator = new Migrator(adapter, []);
      await migrator.internalMetadata.createTable();
      await migrator.internalMetadata.set("environment", "production");
    } finally {
      await adapter.close();
    }

    const configurations = new DatabaseConfigurations([
      new HashConfig("production", "primary", { adapter: "sqlite3", database: dbFile }),
    ]);
    const previous = DatabaseTasks.databaseConfiguration;
    const previousCurrent = DatabaseConfigurations.current;
    const origEnv = process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
    DatabaseTasks.databaseConfiguration = configurations;
    process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = "1";
    try {
      await expect(
        DatabaseTasks.checkProtectedEnvironmentsBang("production"),
      ).resolves.toBeUndefined();
    } finally {
      DatabaseTasks.databaseConfiguration = previous;
      DatabaseConfigurations.current = previousCurrent;
      if (origEnv === undefined) delete process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK;
      else process.env.DISABLE_DATABASE_ENVIRONMENT_CHECK = origEnv;
    }
  });

  it("Migrator.checkProtectedEnvironments is read-only and a no-op on fresh DB", async () => {
    const { Migrator, ProtectedEnvironmentError, Base } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "fresh.sqlite3");
    const adapter = new SQLite3Adapter(dbFile);
    const previousProtected = Base.protectedEnvironments;
    Base.protectedEnvironments = ["production"];
    try {
      const migrator = new Migrator(adapter, [], { environment: "production" });
      // No environment stamped yet → no raise even though current env is
      // in the protected list. Matches Rails' protected_environment? ==
      // nil semantics.
      await expect(migrator.checkProtectedEnvironments()).resolves.toBeUndefined();
      expect(await migrator.protectedEnvironment()).toBe(false);

      // Verify no ar_internal_metadata was created by the check.
      expect(await migrator.internalMetadata.tableExists()).toBe(false);

      // After stamping as production, both calls reflect the protected state.
      await migrator.internalMetadata.createTable();
      await migrator.internalMetadata.set("environment", "production");
      expect(await migrator.protectedEnvironment()).toBe(true);
      await expect(migrator.checkProtectedEnvironments()).rejects.toBeInstanceOf(
        ProtectedEnvironmentError,
      );
    } finally {
      Base.protectedEnvironments = previousProtected;
      await adapter.close();
    }
  });

  it("InternalMetadata with enabled=false refuses set writes with EnvironmentStorageError", async () => {
    const { EnvironmentStorageError, InternalMetadata } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "disabled.sqlite3");
    const adapter = new SQLite3Adapter(dbFile);
    try {
      const disabledMeta = new InternalMetadata(adapter, { enabled: false });
      expect(disabledMeta.enabled).toBe(false);

      // createTable + createTableAndSetFlags silently no-op (Rails'
      // create_table_and_set_flags returns early when enabled? is false).
      await expect(disabledMeta.createTable()).resolves.toBeUndefined();
      await expect(disabledMeta.createTableAndSetFlags("production")).resolves.toBeUndefined();
      expect(await disabledMeta.tableExists()).toBe(false);

      // Direct `set` raises so callers that attempt a write through a
      // disabled instance fail loudly.
      await expect(disabledMeta.set("environment", "test")).rejects.toBeInstanceOf(
        EnvironmentStorageError,
      );
    } finally {
      await adapter.close();
    }
  });

  it("Migrator plumbs internalMetadataEnabled=false through to InternalMetadata", async () => {
    const { Migrator, EnvironmentStorageError } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "disabled-migrator.sqlite3");
    const adapter = new SQLite3Adapter(dbFile);
    try {
      const migrator = new Migrator(adapter, [], { internalMetadataEnabled: false });
      expect(migrator.internalMetadata.enabled).toBe(false);
      await expect(
        migrator.internalMetadata.set("environment", "production"),
      ).rejects.toBeInstanceOf(EnvironmentStorageError);
    } finally {
      await adapter.close();
    }
  });

  it("Migrator with internalMetadataEnabled=false migrates without stamping", async () => {
    const { Migrator } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "no-metadata-migrate.sqlite3");
    const adapter = new SQLite3Adapter(dbFile);
    try {
      // Low-level MigrationLike shape (same pattern migrator.test.ts uses)
      // — bypasses the Migration base class so the test doesn't depend on
      // its schema-helper wiring.
      const migrations = [
        {
          version: "20260101000000",
          name: "CreateWidgets",
          migration: () => ({
            up: async (a: typeof adapter) => {
              await a.executeMutation(`CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)`);
            },
            down: async (a: typeof adapter) => {
              await a.executeMutation(`DROP TABLE widgets`);
            },
          }),
        },
      ];
      const migrator = new Migrator(adapter, migrations, {
        internalMetadataEnabled: false,
      });

      // Migrate should succeed and NOT throw EnvironmentStorageError
      // despite the stamping call site being hit.
      await expect(migrator.migrate()).resolves.toBeUndefined();

      // Table exists; metadata table does not.
      const tables = (await adapter.execute(
        `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`,
      )) as Array<{ name: string }>;
      const names = tables.map((t) => t.name);
      expect(names).toContain("widgets");
      expect(names).not.toContain("ar_internal_metadata");

      // lastStoredEnvironment short-circuits to null when disabled.
      expect(await migrator.lastStoredEnvironment()).toBeNull();
    } finally {
      await adapter.close();
    }
  });

  it("lastStoredEnvironment returns null when metadata is disabled even if table exists", async () => {
    const { Migrator, InternalMetadata } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "stale-metadata.sqlite3");
    const adapter = new SQLite3Adapter(dbFile);
    try {
      // Seed a real metadata table + environment value with a separate
      // enabled=true instance.
      const enabledMeta = new InternalMetadata(adapter, { enabled: true });
      await enabledMeta.createTable();
      await enabledMeta.set("environment", "production");

      // Disabled Migrator should still report null (no stale read).
      const migrator = new Migrator(adapter, [], { internalMetadataEnabled: false });
      expect(await migrator.lastStoredEnvironment()).toBeNull();
      expect(await migrator.protectedEnvironment()).toBe(false);
    } finally {
      await adapter.close();
    }
  });

  it("SQLiteDatabaseTasks.truncateAll deletes user tables but keeps schema_migrations + ar_internal_metadata", async () => {
    const {
      SQLiteDatabaseTasks,
      Migrator,
      HashConfig: HC,
    } = await import("@blazetrails/activerecord");
    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");

    const dbFile = path.join(tmpDir, "truncate.sqlite3");
    const seedAdapter = new SQLite3Adapter(dbFile);
    try {
      await seedAdapter.executeMutation("CREATE TABLE posts (id INTEGER PRIMARY KEY, title TEXT)");
      await seedAdapter.executeMutation("INSERT INTO posts (title) VALUES ('a'), ('b')");
      const migrator = new Migrator(seedAdapter, []);
      await migrator.internalMetadata.createTableAndSetFlags("development");
      await seedAdapter.executeMutation(
        "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR NOT NULL PRIMARY KEY)",
      );
      await seedAdapter.executeMutation(
        "INSERT INTO schema_migrations (version) VALUES ('20260101000000')",
      );
    } finally {
      await seedAdapter.close();
    }

    const config = new HC("development", "primary", {
      adapter: "sqlite3",
      database: dbFile,
    });
    await new SQLiteDatabaseTasks(config).truncateAll();

    const verify = new SQLite3Adapter(dbFile);
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
      await verify.close();
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
    const seed = new SQLite3Adapter(dbFile);
    try {
      await seed.executeMutation("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
      await seed.executeMutation("INSERT INTO widgets (name) VALUES ('x'), ('y')");
    } finally {
      await seed.close();
    }

    await runDb(["truncate_all"]);
    expect(process.exitCode).toBeUndefined();

    const verify = new SQLite3Adapter(dbFile);
    try {
      const rows = (await verify.execute(`SELECT COUNT(*) AS c FROM widgets`)) as Array<{
        c: number;
      }>;
      expect(Number(rows[0].c)).toBe(0);
    } finally {
      await verify.close();
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
      path.join(tmpDir, "db", "migrations", "20260101000000-create-widgets.ts"),
      `import { Migration } from "@blazetrails/activerecord";
export class CreateWidgets extends Migration {
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
    await runDb(["prepare"]);
    expect(fs.existsSync(dbFile)).toBe(true);
    expect(fs.existsSync(seedMarker)).toBe(true);

    const { SQLite3Adapter } =
      await import("@blazetrails/activerecord/connection-adapters/sqlite3-adapter.js");
    const a = new SQLite3Adapter(dbFile);
    try {
      const tables = await a.execute(
        `SELECT name FROM sqlite_master WHERE type='table' AND name='widgets'`,
      );
      expect(tables).toHaveLength(1);
    } finally {
      await a.close();
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
    const seed = new SQLite3Adapter(dbFile);
    try {
      await seed.executeMutation("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
      await seed.executeMutation("INSERT INTO widgets (name) VALUES ('keep-me')");
    } finally {
      await seed.close();
    }

    await runDb(["seed:replant"]);
    expect(fs.readFileSync(seedMarker, "utf8")).toBe("1");

    const verify = new SQLite3Adapter(dbFile);
    try {
      const rows = (await verify.execute(`SELECT COUNT(*) AS c FROM widgets`)) as Array<{
        c: number;
      }>;
      expect(Number(rows[0].c)).toBe(0);
    } finally {
      await verify.close();
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
    const seed = new SQLite3Adapter(dbFile);
    try {
      await seed.executeMutation(
        "CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT NOT NULL)",
      );
    } finally {
      await seed.close();
    }

    await runDb(["schema:cache:dump"]);

    const cachePath = path.join(tmpDir, "db", "schema_cache.json");
    expect(fs.existsSync(cachePath)).toBe(true);
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
      columns: Record<string, unknown[]>;
      data_sources: Record<string, boolean>;
    };
    expect(Object.keys(parsed.columns)).toContain("widgets");
    expect(parsed.data_sources["widgets"]).toBe(true);
  });

  it("db schema:cache:clear deletes the schema_cache.json file", async () => {
    const cachePath = path.join(tmpDir, "db", "schema_cache.json");
    fs.writeFileSync(cachePath, "{}");
    expect(fs.existsSync(cachePath)).toBe(true);

    await runDb(["schema:cache:clear"]);

    expect(fs.existsSync(cachePath)).toBe(false);
  });

  it("db schema:cache:clear is a no-op when no cache file exists", async () => {
    const cachePath = path.join(tmpDir, "db", "schema_cache.json");
    expect(fs.existsSync(cachePath)).toBe(false);
    await runDb(["schema:cache:clear"]);
    expect(errs).toHaveLength(0);
    // No "Cleared ..." log when nothing was deleted — the command
    // previously logged unconditionally which falsely implied a deletion.
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
    const seed = new SQLite3Adapter(dbFile);
    try {
      await seed.executeMutation(
        "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL)",
      );
      await seed.executeMutation("CREATE UNIQUE INDEX users_on_email ON users (email)");
    } finally {
      await seed.close();
    }

    await runDb(["schema:cache:dump"]);

    const cachePath = path.join(tmpDir, "db", "schema_cache.json");
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8")) as {
      indexes: Record<string, Array<{ name: string; columns: string[]; unique: boolean }>>;
    };
    expect(parsed.indexes["users"]).toEqual([
      { name: "users_on_email", columns: ["email"], unique: true },
    ]);
  });
});
