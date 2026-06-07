// SPIKE — throwaway, do not merge.
// Verifies that loadSchema and reconstructFromSchema on sqlite :memory: pool:1
// complete without deadlock. Findings recorded on the rework-test-setup story.

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Base } from "../base.js";
import { DatabaseTasks } from "./database-tasks.js";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { DatabaseConfigurations } from "../database-configurations.js";
import { HashConfig } from "../database-configurations/hash-config.js";

// Minimal schema: creates one table so DDL execution is verifiable.
const SCHEMA_CONTENT = `export default async function defineSchema(ctx) {
  await ctx.createTable("spike_results", { force: "cascade" }, (t) => {
    t.string("result");
  });
}
`;

SQLiteDatabaseTasks.register();

describe("memory-loadschema-spike", () => {
  const savedFormat = DatabaseTasks.schemaFormat;
  const savedConfig = DatabaseTasks.databaseConfiguration;
  const savedRoot = DatabaseTasks.root;

  let tmp: string | null = null;

  afterEach(() => {
    DatabaseTasks.schemaFormat = savedFormat;
    DatabaseTasks.databaseConfiguration = savedConfig;
    DatabaseTasks.root = savedRoot;
    try {
      Base.removeConnection();
    } catch {
      /* no pool */
    }
    if (tmp) {
      fs.rmSync(tmp, { recursive: true, force: true });
      tmp = null;
    }
  });

  it("loadSchema completes without deadlock on sqlite :memory: pool:1", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-spike-load-"));
    const schemaFile = path.join(tmp, "schema.mjs");
    fs.writeFileSync(schemaFile, SCHEMA_CONTENT);

    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    DatabaseTasks.schemaFormat = "ts";
    const config = new HashConfig("test", "primary", { adapter: "sqlite3", database: ":memory:" });

    // Should resolve without deadlock.
    await expect(DatabaseTasks.loadSchema(config, "ts", schemaFile)).resolves.toBeUndefined();

    // Verify DDL executed — spike_results table must exist.
    const adapter = Base.connectionPool().leaseConnection();
    const rows = (await adapter.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='spike_results'",
    )) as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
  });

  it("reconstructFromSchema completes without deadlock on sqlite :memory: pool:1", async () => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "trails-spike-recon-"));
    const schemaFile = path.join(tmp, "schema.mjs");
    fs.writeFileSync(schemaFile, SCHEMA_CONTENT);

    await Base.establishConnection({ adapter: "sqlite3", database: ":memory:", pool: 1 });
    DatabaseTasks.schemaFormat = "ts";
    DatabaseTasks.databaseConfiguration = new DatabaseConfigurations({
      test: { adapter: "sqlite3", database: ":memory:" },
    });
    const config = new HashConfig("test", "primary", { adapter: "sqlite3", database: ":memory:" });

    // Should resolve without deadlock.
    // For :memory: this goes through the purge+loadSchema branch (no SHA1 stamp on fresh DB).
    await expect(
      DatabaseTasks.reconstructFromSchema(config, "ts", schemaFile),
    ).resolves.toBeUndefined();

    // Verify DDL executed — spike_results table must exist after reconnect.
    const adapter = Base.connectionPool().leaseConnection();
    const rows = (await adapter.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='spike_results'",
    )) as Array<{ name: string }>;
    expect(rows).toHaveLength(1);
  });
});
