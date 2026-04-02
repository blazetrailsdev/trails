import { describe, it, expect, beforeEach, afterEach } from "vitest";
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
      const schema = await SchemaDumper.dump(source);
      expect(schema).toContain("users");
      expect(schema).toContain("createTable");

      // Load into a fresh database
      const targetCtx = new MigrationContext(targetAdapter);
      const defineSchema = new Function(
        "ctx",
        schema
          .replace(
            "export default async function defineSchema(ctx: any) {",
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
