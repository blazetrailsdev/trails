/**
 * Per-connection Temporal typeCast callback for the mysql2 driver.
 *
 * mysql2's default field decoder converts DATETIME/TIMESTAMP/DATE/TIME
 * columns into JS Date objects, losing microsecond precision. Passing
 * `{ typeCast }` to `mysql.createPool` intercepts those fields and
 * returns the appropriate Temporal type instead.
 *
 * In mysql2's typeCast callback, `field.type` is a string name (e.g.
 * "TIMESTAMP") not a numeric OID. The callback reads the raw wire string
 * via `field.string()` and dispatches to the matching parser.
 *
 * Precondition: the connection's `@@session.time_zone` must be `'+00:00'`
 * (enforced via pool.on('connection') in Mysql2Adapter.newClient). Without
 * this, TIMESTAMP strings arrive in the server's session timezone and
 * parseMysqlInstant would produce wrong instants.
 *
 * We do NOT call any global mysql2 type registration — that would mutate
 * a process-wide registry shared with other mysql2 users in the process.
 */

import mysql from "mysql2/promise";
import {
  parseMysqlInstant,
  parseMysqlDatetimeAsInstant,
  parseMysqlDate,
  parseMysqlTime,
} from "../abstract/temporal-wire.js";

type Field = { type: string; string: () => string | null };
type NextFn = () => unknown;

/**
 * mysql2 `typeCast` callback. Pass as `{ typeCast }` in pool/connection options.
 *
 * Returns Temporal types for temporal fields; delegates all other fields
 * to the driver default via `next()`.
 */
export function temporalTypeCast(field: Field, next: NextFn): unknown {
  switch (field.type) {
    case "TIMESTAMP":
    case "TIMESTAMP2": {
      const raw = field.string();
      if (raw === null) return null;
      return parseMysqlInstant(raw);
    }
    case "DATETIME":
    case "DATETIME2": {
      const raw = field.string();
      if (raw === null) return null;
      return parseMysqlDatetimeAsInstant(raw);
    }
    case "DATE":
    case "NEWDATE": {
      // NEWDATE is the MySQL protocol's internal DATE-only wire type.
      const raw = field.string();
      if (raw === null) return null;
      return parseMysqlDate(raw);
    }
    case "TIME":
    case "TIME2": {
      const raw = field.string();
      if (raw === null) return null;
      return parseMysqlTime(raw);
    }
    default:
      return next();
  }
}

/**
 * mysql2 pool options to wire up Temporal parsing.
 * Spread into the pool config alongside other options.
 */
export const TEMPORAL_POOL_OPTIONS: Pick<mysql.PoolOptions, "typeCast"> = {
  typeCast: temporalTypeCast as unknown as mysql.PoolOptions["typeCast"],
};
