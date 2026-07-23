import type { ArelConnection } from "../visitors/connection.js";
import { quoteSchemaQualifiedName } from "../visitors/split-schema-qualified-name.js";
import { Temporal } from "@blazetrails/activesupport/temporal";

// Standalone comment sanitize for these test hosts: strips block-comment
// delimiters (leaving `--` alone, like Rails' abstract sanitize). Real
// adapters override via `AbstractAdapter#sanitizeAsSqlComment`.
function defaultSanitizeAsSqlComment(value: string): string {
  return String(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\/\*/g, "")
    .replace(/\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type TemporalDateLike =
  | Temporal.Instant
  | Temporal.ZonedDateTime
  | Temporal.PlainDateTime
  | Temporal.PlainDate
  | Temporal.PlainTime;

// Formats a date/time value as a SQL datetime string matching Rails'
// AbstractAdapter#quoted_date. Returns the BARE form, as Rails does
// (`result = value.to_fs(:db)` plus the %06d usec suffix,
// abstract/quoting.rb:184-198) — callers add their own quoting
// (`"'#{quoted_date(value)}'"`, abstract/quoting.rb:99). #4867 established that
// contract on the visitor; it lives on the quoting host now because Rails' Arel
// does no value formatting of its own — `quoted_date` is an adapter method
// reached through `@connection.quote`. Real adapters own the authoritative,
// timezone-aware version in
// packages/activerecord/src/connection-adapters/abstract/quoting.ts; this copy
// only serves arel's own test suite.
//
// `quoted_date`/`quoted_time` deliberately stay OFF `ArelConnection`: Rails puts
// them on the adapter (`ConnectionAdapters::Quoting`), and Arel reaches them only
// indirectly through `@connection.quote`. Adding them to the Arel-facing subset
// would invent a self-dispatch Rails does not have, so this host formats
// inline instead — as it already does for every other value-formatting decision
// on the connection-less path.
//
// Deviation: Rails' `quoted_date` is timezone-aware via
// `ActiveRecord.default_timezone`; that setting lives in activerecord, which arel
// must not depend on. Instant/ZonedDateTime are therefore rendered in UTC here.
// Real adapters (which own the setting) never reach this host.
function quotedDate(value: TemporalDateLike): string {
  if (value instanceof Temporal.Instant)
    return formatPlainDateTime(value.toZonedDateTimeISO("UTC"));
  // Converts rather than reading the wall clock, mirroring the adapter twin's
  // `value.toInstant()` (connection-adapters/abstract/quoting.ts:591) and Rails'
  // `value.getutc` (abstract/quoting.rb:186-188).
  if (value instanceof Temporal.ZonedDateTime)
    return formatPlainDateTime(value.toInstant().toZonedDateTimeISO("UTC"));
  if (value instanceof Temporal.PlainDateTime) return formatPlainDateTime(value);
  if (value instanceof Temporal.PlainDate) {
    return `${padYear(value.year)}-${pad(value.month)}-${pad(value.day)}`;
  }
  return formatPlainDateTime(withEpochDate(value));
}

// Mirrors `quoted_time` (abstract/quoting.rb:203). The `PlainDateTime` half of
// the signature is unreachable from `quoteScalar`, which gates on `PlainTime`
// per Rails' `Type::Time::Value` arm (:102); it is carried to match the adapter
// twin's signature (connection-adapters/abstract/quoting.ts:44) and Rails'
// `change(year:, month:, day:)`, which takes any datetime. Normalise the date to 2000-01-01, then strip the date prefix off `quoted_date`.
function quotedTime(value: Temporal.PlainTime | Temporal.PlainDateTime): string {
  return quotedDate(withEpochDate(value)).replace(/^\d{4}-\d{2}-\d{2} /, "");
}

function withEpochDate(value: Temporal.PlainTime | Temporal.PlainDateTime): Temporal.PlainDateTime {
  if (value instanceof Temporal.PlainDateTime) return value.with({ year: 2000, month: 1, day: 1 });
  return new Temporal.PlainDateTime(
    2000,
    1,
    1,
    value.hour,
    value.minute,
    value.second,
    value.millisecond,
    value.microsecond,
    value.nanosecond,
  );
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

// Mirrors `padYear` in connection-adapters/abstract/sql-datetime.ts: a negative
// year keeps its sign rather than being zero-padded into `"00-1"`.
function padYear(year: number): string {
  return year < 0 ? String(year) : String(year).padStart(4, "0");
}

function formatPlainDateTime(v: {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  microsecond: number;
}): string {
  const usec = v.millisecond * 1000 + v.microsecond;
  const frac = usec > 0 ? `.${pad(usec, 6)}` : "";
  return `${padYear(v.year)}-${pad(v.month)}-${pad(v.day)} ${pad(v.hour)}:${pad(v.minute)}:${pad(v.second)}${frac}`;
}

// Rails' `when Date, Time` arms (abstract/quoting.rb:85, :103) match Ruby's own
// time types; trails' analogue is Temporal, not JS `Date`, which is rejected
// AR-wide (#939). A JS `Date` is refused here for the same reason the adapter
// refuses it (connection-adapters/abstract/quoting.ts), rather than being
// silently formatted as if it were a Time.
function isTemporalDateLike(value: unknown): value is TemporalDateLike {
  return (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.ZonedDateTime ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime
  );
}

function quoteScalar(this: ArelConnection, value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  // Mirrors Rails' abstract `when Numeric then value.to_s` (abstract/quoting.rb:82):
  // every number renders bare, including non-finite ones. Only PostgreSQL's adapter
  // overrides this to string-quote non-finite values (postgresql/quoting.rb:111-115);
  // postgresqlDefaultQuoter.quote layers that on top before delegating here.
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? this.quotedTrue() : this.quotedFalse();
  // Normalise all typed-array views to Uint8Array before handing off so
  // quotedBinary can rely on a consistent shape.
  if (ArrayBuffer.isView(value)) {
    const bytes =
      value instanceof Uint8Array
        ? value
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return this.quotedBinary(bytes);
  }
  if (value instanceof Temporal.PlainTime) return `'${quotedTime(value).replace(/'/g, "''")}'`;
  if (isTemporalDateLike(value)) return `'${quotedDate(value).replace(/'/g, "''")}'`;
  // boundary: the JS Date is matched only to refuse it, per #939.
  if (value instanceof Date) {
    throw new TypeError(
      "quote: JS Date is not accepted — use a Temporal type (Instant, PlainDateTime, etc.)",
    );
  }
  if (typeof value === "object") {
    const proto = Object.getPrototypeOf(value);
    const hasCustomToString =
      proto === Object.prototype && value.toString !== Object.prototype.toString;
    if ((proto === Object.prototype || proto === null) && !hasCustomToString) {
      try {
        const json = JSON.stringify(value);
        if (json !== undefined) return `'${json.replace(/'/g, "''")}'`;
      } catch {
        // circular references, BigInt, etc. — fall through
      }
    }
  }
  // Only escape single quotes here; backslash escaping is dialect-specific
  // and handled by quoteString (MySQL/PG adapters override quote() as needed).
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * MySQL test quoter: backtick-quoted identifiers, same escaping as the abstract
 * adapter. Test-only — surfaced as `mysqlTestConnection` (connection.ts); no
 * visitor falls back to it.
 */
export const mysqlDefaultQuoter: ArelConnection = {
  quoteTableName(name: string): string {
    return String(name)
      .split(".")
      .map((p) => "`" + p.replace(/`/g, "``") + "`")
      .join(".");
  },

  quoteColumnName(name: string): string {
    return "`" + String(name).replace(/`/g, "``") + "`";
  },

  quoteString(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  },

  quote: quoteScalar,

  quotedBinary(value: unknown): string {
    const bytes =
      value instanceof Uint8Array
        ? value
        : new Uint8Array(
            String(value)
              .split("")
              .map((c) => c.charCodeAt(0)),
          );
    return `x'${Buffer.from(bytes).toString("hex")}'`;
  },

  quotedTrue(): string {
    return "TRUE";
  },
  quotedFalse(): string {
    return "FALSE";
  },

  // Mirrors ActiveRecord MySQL::Quoting — `quoted_true`/`quoted_false` are
  // inherited, but the unquoted pair is overridden to 1/0
  // (`mysql/quoting.rb:72-79`).
  unquotedTrue(): number {
    return 1;
  },
  unquotedFalse(): number {
    return 0;
  },

  // Mirrors ActiveRecord MySQL::Quoting#cast_bound_value: numerics/booleans
  // serialize to their string form (1/0 for booleans) before binding.
  castBoundValue(value: unknown): unknown {
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (value === true) return "1";
    if (value === false) return "0";
    return value;
  },

  sanitizeAsSqlComment: defaultSanitizeAsSqlComment,
};

/**
 * Generic test connection: ANSI double-quoted identifiers and single-quoted
 * strings, matching the Rails abstract-adapter defaults.
 *
 * Test-only, and permanently so as long as `packages/arel` ships its own suite:
 * Rails' Arel tests reach a real adapter via `Table.engine.lease_connection`
 * (one gem, no cycle), but `@blazetrails/activerecord` depends on
 * `@blazetrails/arel`, so arel-side tests cannot import a real adapter without
 * a circular dependency. This host stands in for that adapter; production code
 * always passes a real connection (RFC 0007) — no visitor defaults to this.
 */
export const defaultQuoter: ArelConnection = {
  quoteTableName(name: string): string {
    return quoteSchemaQualifiedName(String(name));
  },

  quoteColumnName(name: string): string {
    return `"${String(name).replace(/"/g, '""')}"`;
  },

  quoteString(s: string): string {
    return s.replace(/\\/g, "\\\\").replace(/'/g, "''");
  },

  quote: quoteScalar,

  quotedBinary(value: unknown): string {
    const bytes =
      value instanceof Uint8Array
        ? value
        : new Uint8Array(
            String(value)
              .split("")
              .map((c) => c.charCodeAt(0)),
          );
    return `'${Buffer.from(bytes).toString("hex")}'`;
  },

  quotedTrue(): string {
    return "TRUE";
  },
  quotedFalse(): string {
    return "FALSE";
  },

  // Mirrors ActiveRecord Quoting#unquoted_true/#unquoted_false: the abstract
  // adapter returns Ruby true/false (`abstract/quoting.rb:170-180`). PostgreSQL
  // does not override the pair, so it inherits these.
  unquotedTrue(): boolean {
    return true;
  },
  unquotedFalse(): boolean {
    return false;
  },

  // Mirrors ActiveRecord Quoting#cast_bound_value: the abstract adapter
  // returns the value unchanged.
  castBoundValue(value: unknown): unknown {
    return value;
  },

  sanitizeAsSqlComment: defaultSanitizeAsSqlComment,
};

/**
 * PostgreSQL test quoter, surfaced as `postgresqlTestConnection`
 * (connection.ts). Rails' `Arel::Visitors::PostgreSQL` has no `quote` override
 * — array literals are formatted by the adapter (`quote(OID::Array::Data)` →
 * `encode_array`, postgresql/quoting.rb:221-226). Arel-side tests have no
 * adapter to reach (see `defaultQuoter`), and this host does no array encoding
 * either — an array reaching `quote` here is not a case Rails' Arel handles.
 */
export const postgresqlDefaultQuoter: ArelConnection = {
  ...defaultQuoter,

  quote(value: unknown): string {
    // Mirrors PostgreSQL::Quoting#quote (postgresql/quoting.rb:111-115): non-finite
    // Numerics string-quote (`'Infinity'::float8`). This override is PG-only — the
    // base/MySQL hosts emit them bare, per the abstract adapter.
    if (typeof value === "number" && !Number.isFinite(value)) {
      return `'${String(value)}'`;
    }
    return quoteScalar.call(this, value);
  },
};
