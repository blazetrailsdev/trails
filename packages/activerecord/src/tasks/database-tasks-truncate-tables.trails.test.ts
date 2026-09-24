import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { DatabaseTasks } from "./database-tasks.js";
import "./sqlite-database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";
import { clearRegisteredTasks } from "../test-helpers/registered-tasks.js";

describe("DatabaseTasksTruncateTablesTest", () => {
  const created: string[] = [];

  afterEach(async () => {
    DatabaseTasks.databaseConfiguration = null;
    try {
      await Base.removeConnection();
    } catch {
      void 0;
    }
    for (const file of created.splice(0)) fs.rmSync(file, { force: true });
  });

  it("truncates every table on the leased connection, leaving the bookkeeping tables", async () => {
    const dbPath = path.join(os.tmpdir(), `trails-truncate-${randomUUID()}.sqlite3`);
    created.push(dbPath);
    const config = new HashConfig("development", "primary", {
      adapter: "sqlite3",
      database: dbPath,
    });

    const { BetterSQLite3Adapter } =
      await import("../connection-adapters/better-sqlite3-adapter.js");
    const seed = new BetterSQLite3Adapter({ database: dbPath });
    await seed.execute("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
    await seed.execute("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)");
    await seed.execute("INSERT INTO widgets (name) VALUES ('gizmo')");
    await seed.execute("INSERT INTO schema_migrations (version) VALUES ('1')");
    await seed.disconnectBang();

    clearRegisteredTasks();
    DatabaseTasks.registerTask(/sqlite/, class {});
    await DatabaseTasks.truncateTables(config);

    const reader = new BetterSQLite3Adapter({ database: dbPath });
    try {
      expect(await reader.execute("SELECT * FROM widgets")).toEqual([]);
      expect(await reader.execute("SELECT * FROM schema_migrations")).toHaveLength(1);
    } finally {
      await reader.execute("DROP TABLE IF EXISTS widgets");
      await reader.execute("DROP TABLE IF EXISTS schema_migrations");
      await reader.disconnectBang();
    }
  });
});
