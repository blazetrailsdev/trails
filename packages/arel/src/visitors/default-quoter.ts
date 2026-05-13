import type { ArelConnection } from "./connection.js";

function quoteScalar(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") {
    // Non-finite numbers must be string-quoted; databases reject bare
    // `Infinity` / `NaN` identifiers. PG accepts 'Infinity'::float8.
    return Number.isFinite(value) ? String(value) : `'${String(value)}'`;
  }
  if (typeof value === "bigint") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
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
    return String(name)
      .split(".")
      .map((p) => `"${p.replace(/"/g, '""')}"`)
      .join(".");
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
};
