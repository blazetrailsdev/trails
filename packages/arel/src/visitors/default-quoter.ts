import type { ArelConnection } from "./connection.js";
import { quoteSchemaQualifiedName } from "./split-schema-qualified-name.js";
import { quoteArrayLiteral } from "../quote-array.js";

// Standalone comment sanitize for connection-less `Node#toSql()` (debug aid):
// strips block-comment delimiters (leaving `--` alone, like Rails' abstract
// sanitize). Real adapters override via `AbstractAdapter#sanitizeAsSqlComment`.
function defaultSanitizeAsSqlComment(value: string): string {
  return String(value)
    .replace(/[\r\n]+/g, " ")
    .replace(/\/\*/g, "")
    .replace(/\*\//g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Formats a date-like value as a SQL datetime string matching Rails'
// AbstractAdapter#quoted_date. Returns the BARE form, as Rails does
// (`result = value.to_fs(:db)` plus the %06d usec suffix,
// abstract/quoting.rb:184-198) — callers add their own quoting
// (`"'#{quoted_date(value)}'"`, abstract/quoting.rb:99). #4867 established that
// contract on the visitor; it lives on the quoting host now because Rails' Arel
// does no value formatting of its own — `quoted_date` is an adapter method
// reached through `@connection.quote`. Real adapters own the authoritative,
// timezone-aware version in
// packages/activerecord/src/connection-adapters/abstract/quoting.ts; this copy
// only serves the connection-less `Node#toSql()` debug path.
function quotedDate(d: { toISOString(): string }): string {
  const match = d.toISOString().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d+))?Z?$/);
  if (!match) return d.toISOString();
  const [, date, time, frac] = match;
  // Normalise to exactly 6 digits: pad short fractions, truncate long ones.
  const micros = frac ? parseInt((frac + "000000").slice(0, 6), 10) : 0;
  return micros > 0 ? `${date} ${time}.${String(micros).padStart(6, "0")}` : `${date} ${time}`;
}

function isDateLike(value: unknown): value is { toISOString(): string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "toISOString" in value &&
    typeof (value as { toISOString: unknown }).toISOString === "function"
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
  if (isDateLike(value)) return `'${quotedDate(value).replace(/'/g, "''")}'`;
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
 * MySQL default quoter: backtick-quoted identifiers, same escaping as the abstract adapter.
 * Used when `new MySQL()` is constructed without a connection quoter (test / debug use).
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
 * Default connection used when no adapter is passed to a visitor.
 * Emits ANSI double-quoted identifiers and single-quoted strings —
 * matches the Rails abstract-adapter defaults.
 *
 * `Node#toSql()` (no connection in scope) uses this; treat its output
 * as a debug aid, not production SQL — same as Rails.
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
 * PostgreSQL quoter used when `new PostgreSQL()` is constructed without a
 * connection (test / debug use). Rails' `Arel::Visitors::PostgreSQL` has no
 * `quote` override — array literals are formatted by the adapter
 * (`quote(OID::Array::Data)` → `encode_array`, postgresql/quoting.rb:221-226).
 * Trails' connection-less visitors have no adapter to reach, so this host
 * carries the minimal array-literal encoding in the adapter's place.
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
    if (Array.isArray(value)) {
      // A Temporal element — trails' `Time` analogue — is NOT claimed by
      // `isDateLike` (Temporal exposes no `toISOString`) and so hits
      // `type_cast`'s terminal raise. That is unreachable for a real
      // `timestamp[]`: this host serves only the connection-less
      // `new PostgreSQL()` debug path, and every adapter construction site
      // passes a real connection (postgresql-adapter.ts `arelVisitor`,
      // insert-all.ts:786-788), whose own `type_cast_array` → `type_cast`
      // (connection-adapters/postgresql/quoting.ts:445-449) owns the
      // Temporal arms and never reaches `quoteArrayLiteral`. Routing Temporal
      // through a `quotedTime` here needs a `quoted_time` on `ArelConnection`,
      // which Rails puts on the adapter, not on Arel.
      //
      // formatElement keeps #4867's fix alive on this path: a date element gets
      // the same `quoted_date` form the scalar path emits, mirroring Rails'
      // `type_cast_array` → `type_cast` → `when Date, Time then quoted_date`
      // (abstract/quoting.rb:94-107). quoteArrayLiteral applies the `"..."`
      // quoting, so the hook returns the bare form.
      const literal = quoteArrayLiteral(value, this, (v) =>
        isDateLike(v) ? quotedDate(v) : undefined,
      );
      return `'${literal.replace(/'/g, "''")}'`;
    }
    return quoteScalar.call(this, value);
  },
};
