import { describe, it, expect } from "vitest";
import { ConnectionAdapters } from "../../../lib/connection-adapters.js";

describe("ConnectionAdapters.loadPath", () => {
  it("resolves every built-in adapter thunk to the module that defines its class", async () => {
    const expected: Record<string, string> = {
      better_sqlite3_adapter: "BetterSQLite3Adapter",
      node_sqlite_adapter: "NodeSQLiteAdapter",
      libsql_adapter: "LibSQLAdapter",
      libsql_remote_adapter: "LibSQLRemoteAdapter",
      libsql_replica_adapter: "LibSQLReplicaAdapter",
      mysql2_adapter: "Mysql2Adapter",
      postgresql_adapter: "PostgreSQLAdapter",
    };
    for (const [file, name] of Object.entries(expected)) {
      const mod = (await ConnectionAdapters.loadPath[
        `active_record/connection_adapters/${file}`
      ]()) as Record<string, unknown>;
      expect(mod[name]).toBe(ConnectionAdapters[name as keyof typeof ConnectionAdapters]);
    }
  });
});
