/**
 * Per-connection Temporal type parsers for the pg driver.
 *
 * pg's default OID parsers decode timestamp/date columns into JS Date
 * objects, losing microsecond precision. By passing `{ types: { getTypeParser } }`
 * to `new pg.Pool(...)` we redirect those OIDs to our wire parsers, which
 * return Temporal types with full precision.
 *
 * We deliberately do NOT call `pg.types.setTypeParser` — that mutates a
 * process-global registry shared with drizzle, pg-boss, raw pg.Client users,
 * etc. Per-connection tables, not global mutation.
 */

import pg from "pg";
import {
  parsePostgresInstant,
  parsePostgresPlainDateTime,
  parsePostgresDate,
  parsePostgresTime,
  parsePostgresTimeTz,
} from "../abstract/temporal-wire.js";

// PostgreSQL OIDs for the temporal types we intercept.
const OID_DATE = 1082;
const OID_TIME = 1083;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;
const OID_TIMETZ = 1266;

// Text-format parsers receive strings; binary-format parsers receive Buffer.
type PgParser = (value: string | Buffer) => unknown;

const TEMPORAL_PARSERS: ReadonlyMap<number, PgParser> = new Map<number, PgParser>([
  [OID_TIMESTAMPTZ, (v) => parsePostgresInstant(v as string)],
  [OID_TIMESTAMP, (v) => parsePostgresPlainDateTime(v as string)],
  [OID_DATE, (v) => parsePostgresDate(v as string)],
  [OID_TIME, (v) => parsePostgresTime(v as string)],
  [OID_TIMETZ, (v) => parsePostgresTimeTz(v as string)],
]);

/**
 * Drop-in replacement for `pg.types.getTypeParser`.
 * Pass as `{ types: { getTypeParser } }` in the pg.Pool / pg.Client config.
 *
 * Intercepts text-format for the five temporal OIDs and returns our Temporal
 * wire parsers. All other OIDs delegate to `pg.types.getTypeParser` so the
 * built-in parsers (int, bool, numeric, etc.) remain active. Returning `null`
 * is NOT correct — pg stores the return value directly in its `_parsers` array
 * and calls it; a non-function crashes query processing.
 */
export function getTypeParser(oid: number, format?: string): PgParser {
  const fmt = format || "text";
  if (fmt === "text") {
    const parser = TEMPORAL_PARSERS.get(oid);
    if (parser) return parser;
  }
  return pg.types.getTypeParser(oid, fmt as "text" | "binary") as PgParser;
}
