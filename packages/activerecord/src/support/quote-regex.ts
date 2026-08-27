import * as mysqlQuoting from "../connection-adapters/mysql/quoting.js";
import * as pgQuoting from "../connection-adapters/postgresql/quoting.js";
import * as sqliteQuoting from "../connection-adapters/sqlite3/quoting.js";
import { adapterType } from "../test-adapter.js";

function _selectImpl() {
  switch (adapterType) {
    case "mysql":
      return mysqlQuoting;
    case "postgres":
      return pgQuoting;
    case "sqlite":
      return sqliteQuoting;
    default: {
      const _exhaustive: never = adapterType;
      throw new Error(`quote-regex: unsupported adapterType ${String(_exhaustive)}`);
    }
  }
}

const _impl = _selectImpl();

export const quoteTableName: (name: string) => string = _impl.quoteTableName;

export const quoteColumnName: (name: string) => string = _impl.quoteColumnName;

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
