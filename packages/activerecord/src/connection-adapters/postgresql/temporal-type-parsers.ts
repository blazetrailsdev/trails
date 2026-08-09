/**
 * Per-connection type parsers for the pg driver — the Temporal ones, plus
 * `int8`.
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

import {
  parsePostgresInstant,
  parsePostgresTimestampAsInstant,
  parsePostgresDate,
} from "../abstract/temporal-wire.js";

// PostgreSQL OIDs for the temporal types we intercept.
const OID_DATE = 1082;
const OID_TIMESTAMP = 1114;
const OID_TIMESTAMPTZ = 1184;

// Array OIDs for the temporal types. pg's default array parsers decode each
// element with the built-in scalar parser (JS Date in the host's local zone),
// which shifts naive `timestamp[]` values by the host UTC offset and drops
// sub-millisecond precision. Returning the raw array literal here lets
// OID::Array.deserialize parse it, routing each element through the Temporal
// wire parser the same way the scalar path does.
const OID_DATE_ARRAY = 1182;
const OID_TIME_ARRAY = 1183;
const OID_TIMESTAMP_ARRAY = 1115;
const OID_TIMESTAMPTZ_ARRAY = 1185;
const OID_TIMETZ_ARRAY = 1270;

// `int8` (bigint), which `count(*)` also answers. pg's built-in text parser
// leaves it a String because a 64-bit integer does not fit a JS number, so
// every `select_values` reader of a numeric column answered `"3"` on PG and `3`
// on sqlite/mysql. Rails has no such split: the pg gem's own type map decodes
// int8 to an Integer, which is why `SchemaMigration#count` /
// `InternalMetadata#count` are `select_values(...).first` with no coercion
// (`schema_migration.rb:91-98`, `internal_metadata.rb:64-71`).
const OID_INT8 = 20;

// Text-format parsers receive strings; binary-format parsers receive Buffer.
type PgParser = (value: string | Buffer) => unknown;

const passthrough: PgParser = (v) => v;

/**
 * Decodes an `int8` the way `IntegerType#narrowBigInt` does: a safe-range value
 * is a plain JS `number`, and a genuine bignum past float64's exact-integer
 * range stays a `bigint` rather than truncating onto the nearest float.
 * `BigIntegerType#castValue` accepts both, so this is the same contract
 * better-sqlite3 and mysql2 already hand the type layer.
 */
const parseInt8: PgParser = (v) => {
  const value = BigInt(v as string);
  const num = Number(value);
  return Number.isSafeInteger(num) ? num : value;
};

const CONNECTION_PARSERS: ReadonlyMap<number, PgParser> = new Map<number, PgParser>([
  [OID_TIMESTAMPTZ, (v) => parsePostgresInstant(v as string)],
  [OID_TIMESTAMP, (v) => parsePostgresTimestampAsInstant(v as string)],
  [OID_DATE, (v) => parsePostgresDate(v as string)],
  [OID_INT8, parseInt8],
  [OID_DATE_ARRAY, passthrough],
  [OID_TIME_ARRAY, passthrough],
  [OID_TIMESTAMP_ARRAY, passthrough],
  [OID_TIMESTAMPTZ_ARRAY, passthrough],
  [OID_TIMETZ_ARRAY, passthrough],
]);

/**
 * Returns a drop-in replacement for `pg.types.getTypeParser`.
 * Pass the returned function as `{ types: { getTypeParser } }` in the pg.Pool / pg.Client config.
 *
 * Intercepts text-format for the three temporal OIDs and returns our Temporal
 * wire parsers. `time` (1083) and `timetz` (1266) are deliberately not among
 * them: Rails hands the driver's raw string to `ActiveRecord::Type::Time`,
 * whose `cast_value` parses it through `::Date._parse` and answers a `::Time`
 * on the 2000-01-01 dummy date — including the shift a `timetz` offset asks for
 * (time.rb:26-27). pg leaves both as strings by default, so not intercepting
 * them is what routes them there. All other OIDs delegate to `pgTypes.getTypeParser` so the
 * built-in parsers (int, bool, numeric, etc.) remain active. Returning `null`
 * is NOT correct — pg stores the return value directly in its `_parsers` array
 * and calls it; a non-function crashes query processing.
 *
 * Accepts `pgTypes` rather than importing `pg` directly so this module carries
 * no eager native-package import — keeping it loadable in browser bundles even
 * though PostgreSQL itself is server-only.
 */
export function makeGetTypeParser(pgTypes: {
  getTypeParser: (oid: number, format: "text" | "binary") => unknown;
}): (oid: number, format?: string) => PgParser {
  return function getTypeParser(oid: number, format?: string): PgParser {
    const fmt = format || "text";
    if (fmt === "text") {
      const parser = CONNECTION_PARSERS.get(oid);
      if (parser) return parser;
    }
    return pgTypes.getTypeParser(oid, fmt as "text" | "binary") as PgParser;
  };
}
