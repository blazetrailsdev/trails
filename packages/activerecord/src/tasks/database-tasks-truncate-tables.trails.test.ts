import { describe, it, expect, afterEach } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { randomUUID } from "crypto";
import { DatabaseTasks } from "./database-tasks.js";
import { SQLiteDatabaseTasks } from "./sqlite-database-tasks.js";
import { HashConfig } from "../database-configurations/hash-config.js";
import { Base } from "../base.js";

// Rails' `truncate_tables` leases the pool connection and calls
// `conn.truncate_tables(*conn.tables)` (`tasks/database_tasks.rb:230-234`),
// letting the adapter build its own statements
// (`abstract/database_statements.rb:222-231`). This covers that path, which the
// adapter-specific handler hook shadows wherever one is still registered.
describe("DatabaseTasksTruncateTablesTest", () => {
  const created: string[] = [];

  afterEach(async () => {
    DatabaseTasks.clearRegisteredTasks();
    SQLiteDatabaseTasks.register();
    DatabaseTasks.databaseConfiguration = null;
    try {
      Base.removeConnection();
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
    const seed = new BetterSQLite3Adapter(dbPath);
    await seed.executeMutation("CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT)");
    await seed.executeMutation("CREATE TABLE schema_migrations (version TEXT PRIMARY KEY)");
    await seed.executeMutation("INSERT INTO widgets (name) VALUES ('gizmo')");
    await seed.executeMutation("INSERT INTO schema_migrations (version) VALUES ('1')");
    await seed.close();

    // No handler `truncateAll` registered, so truncation takes the Rails path.
    DatabaseTasks.clearRegisteredTasks();
    DatabaseTasks.registerTask(/sqlite/, {});
    await DatabaseTasks.truncateTables(config);

    const reader = new BetterSQLite3Adapter(dbPath);
    try {
      expect(await reader.execute("SELECT * FROM widgets")).toEqual([]);
      expect(await reader.execute("SELECT * FROM schema_migrations")).toHaveLength(1);
    } finally {
      await reader.executeMutation("DROP TABLE IF EXISTS widgets");
      await reader.executeMutation("DROP TABLE IF EXISTS schema_migrations");
      await reader.close();
    }
  });
});
