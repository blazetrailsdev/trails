/** @noRailsEquivalent CONVERGEABLE sqlite-driver-adapter-subclasses-carry-file-level-covers */
import {
  extend,
  hasKey,
  include,
  merge,
  rbModConstSet,
  rbObjAsString,
} from "@blazetrails/ruby-compat";
import { ConnectionAdapters } from "../namespaces.js";
import type { SqliteDriver } from "../sqlite-adapter.js";
import { libsqlRemoteDriver } from "../sqlite/libsql.js";
import { AbstractAdapter } from "./abstract-adapter.js";
import type { SQLite3Config } from "./pool-config.js";
import { SQLite3Adapter } from "./sqlite3-adapter.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class LibSQLRemoteAdapter extends AbstractAdapter {
  /** @internal */
  declare _connectionParameters: SQLite3Adapter["_connectionParameters"];

  constructor(config: SQLite3Config) {
    super(config);

    this._memoryDatabase = false;
    this._lastAffectedRows = 0;
    this._previousReadUncommitted = null;
    if (!hasKey(this._config, "strict")) {
      this._config.strict = SQLite3Adapter.strictStringsByDefault;
    }
    this._connectionParameters = merge(this._config as SQLite3Config, {
      database: rbObjAsString(this._config.database),
      resultsAsHash: true,
      defaultTransactionMode: "immediate",
    });
  }

  protected static defaultSqliteDriver(): SqliteDriver {
    return libsqlRemoteDriver;
  }
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type
export interface LibSQLRemoteAdapter extends Omit<
  SQLite3Adapter,
  keyof AbstractAdapter | "_connectionParameters"
> {}

include(LibSQLRemoteAdapter, SQLite3Adapter);
extend(LibSQLRemoteAdapter, SQLite3Adapter);
for (const name of ["ADAPTER_NAME", "TYPE_MAP", "EXTENDED_TYPE_MAPS"] as const) {
  rbModConstSet(LibSQLRemoteAdapter, name, SQLite3Adapter[name]);
}

rbModConstSet(ConnectionAdapters, "LibSQLRemoteAdapter", LibSQLRemoteAdapter);
