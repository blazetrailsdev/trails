/** @noRailsEquivalent CONVERGEABLE sqlite-driver-adapter-subclasses-carry-file-level-covers */
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../namespaces.js";
import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlRemoteDriver } from "../sqlite/libsql.js";
import type { SQLite3Config } from "./pool-config.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

export class LibSQLRemoteAdapter extends SQLite3Adapter {
  constructor(config: SQLite3Config) {
    const { database, ...options } = config;
    super({ ...options, database: database && ":memory:", remoteUrl: database });
  }

  protected static override defaultSqliteDriver(): SqliteDriver {
    return libsqlRemoteDriver;
  }

  override supportsConcurrentConnections(): boolean {
    return true;
  }
}

rbModConstSet(ConnectionAdapters, "LibSQLRemoteAdapter", LibSQLRemoteAdapter);
