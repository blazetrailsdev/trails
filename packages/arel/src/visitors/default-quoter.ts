import type { ArelQuoter } from "./to-sql.js";

/**
 * MySQL default quoter: backtick-quoted identifiers, same escaping as abstractQuoter.
 * Used when `new MySQL()` is constructed without a connection quoter (test / debug use).
 */
export const mysqlDefaultQuoter: ArelQuoter = {
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

  quote(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  },
};

/**
 * Default quoter used when no connection quoter is passed to a visitor.
 * Emits ANSI double-quoted identifiers and single-quoted strings —
 * matches the Rails abstract-adapter defaults and the ToSql defaults
 * that existed here before the quoter was extracted.
 *
 * `Node#toSql()` (no connection in scope) uses this; treat its output
 * as a debug aid, not production SQL — same as Rails.
 */
export const defaultQuoter: ArelQuoter = {
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

  quote(value: unknown): string {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
    return `'${String(value).replace(/\\/g, "\\\\").replace(/'/g, "''")}'`;
  },
};
