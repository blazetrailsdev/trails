/**
 * PostgreSQL adapter — connection adapter for PostgreSQL databases.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter
 *
 * Re-exports the main adapter and provides StatementPool and MoneyDecoder
 * classes expected by the Rails API surface.
 */

export { PostgreSQLAdapter } from "../adapters/postgresql-adapter.js";
export { StatementPool } from "./statement-pool.js";

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQLAdapter::MoneyDecoder
 */
export class MoneyDecoder {
  static decode(value: string): number {
    let str = value.trim();
    let negative = false;
    if (str.startsWith("(") && str.endsWith(")")) {
      negative = true;
      str = str.slice(1, -1).trim();
    }
    const cleaned = str.replace(/[$,\s]/g, "");
    const num = parseFloat(cleaned);
    if (isNaN(num)) return NaN;
    return negative ? -num : num;
  }
}
