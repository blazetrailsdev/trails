/**
 * MySQL database statements — MySQL-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements (module)
 */

import { sql as arelSql } from "@blazetrails/arel";
import type { ExplainOption } from "../abstract/database-statements.js";
import type { Nodes } from "@blazetrails/arel";
import { Result } from "../../result.js";
import {
  defaultInsertValue as abstractDefaultInsertValue,
  internalExecQuery,
  toSql as abstractToSql,
} from "../abstract/database-statements.js";
import type { Version } from "../abstract-adapter.js";

export interface DatabaseStatements {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string | false | null,
  ): Promise<unknown>;
  explain(arel: unknown, binds?: unknown[], options?: ExplainOption[]): Promise<string>;
  lastInsertedId(result: unknown): number;
  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral;
}

// MySQL-specific read-query pattern. Mirrors Rails'
// `AbstractAdapter.build_read_query_regexp(:desc, :describe, :set, :show, :use,
// :kill)` unioned with DEFAULT_READ_QUERY (:begin, :commit, :explain, :release,
// :rollback, :savepoint, :select, :with). The leading group consumes any mix of
// "(", whitespace, and SQL comments before the first keyword, so a
// comment/paren-prefixed SELECT (e.g. a query-log-tagged read) still classifies
// as a read.
// Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements::READ_QUERY
const COMMENT_REGEX = String.raw`(?:--.*\n)|/\*(?:[^*]|\*[^/])*\*/`;
const READ_QUERY = new RegExp(
  `^(?:[(\\s]|${COMMENT_REGEX})*` +
    `(?:desc|describe|set|show|use|kill|begin|commit|explain|release|rollback|savepoint|select|with)`,
  "i",
);

/**
 * Returns true when sql is NOT a read query (i.e., is a write).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements#write_query?
 * @internal
 */
export function isWriteQuery(sql: string): boolean {
  // Rails rescues ArgumentError from invalid encoding and retries with .b (binary); JS has no equivalent
  return !READ_QUERY.test(sql);
}

export interface BuildExplainClauseHost {
  isMariadb?(): boolean;
  databaseVersion?: Version;
}

/**
 * Build the EXPLAIN prefix clause for MySQL.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements#build_explain_clause
 */
export function buildExplainClause(
  this: BuildExplainClauseHost | void,
  options: ExplainOption[] = [],
): string {
  if (options.length === 0) return "EXPLAIN";
  const clause = `EXPLAIN ${options.map((o) => (typeof o === "string" ? o.toUpperCase() : `FORMAT=${(o as { format: string }).format.toUpperCase()}`)).join(" ")}`;
  if (isAnalyzeWithoutExplain.call(this) && clause.includes("ANALYZE")) {
    return clause.replace("EXPLAIN ", "");
  }
  return clause;
}

interface SupportsInsertReturningHost {
  /** @internal */
  supportsInsertReturning?(): Promise<boolean>;
}

interface AutoIncrementColumnHost {
  autoIncrement?: boolean;
}

/**
 * @internal
 */
export function isAnalyzeWithoutExplain(this: BuildExplainClauseHost | void): boolean {
  const host = this as BuildExplainClauseHost | null;
  if (!host?.isMariadb?.()) return false;
  // Rails: `database_version >= "10.1.0"` (mysql/database_statements.rb:50).
  return (host.databaseVersion?.compare("10.1.0") ?? -1) >= 0;
}

/** @internal */
export function defaultInsertValue(column: AutoIncrementColumnHost): Nodes.SqlLiteral | undefined {
  // Rails: `super unless column.auto_increment?`
  if (column.autoIncrement) return undefined;
  return abstractDefaultInsertValue(column);
}

/** @internal */
export async function returningColumnValues(
  this: SupportsInsertReturningHost | void,
  result: Result,
): Promise<unknown[] | undefined> {
  if (await (this as SupportsInsertReturningHost | null)?.supportsInsertReturning?.()) {
    return result.rows[0] as unknown[] | undefined;
  }
  // Falls back to abstract base behavior (last_inserted_id path)
  return undefined;
}

export interface MaxAllowedPacketHost {
  showVariable?(name: string): Promise<string | null>;
  /** Mirrors Rails' `@max_allowed_packet` memo. */
  _maxAllowedPacket?: number;
  /** @internal */
  maxAllowedPacket?(): Promise<number>;
}

/** @internal */
export async function combineMultiStatements(
  this: MaxAllowedPacketHost | void,
  totalSql: string[],
): Promise<string[]> {
  const host = this ?? undefined;
  const chunks: string[] = [];
  for (const sql of totalSql) {
    const previousPacket = chunks[chunks.length - 1];
    if (await isMaxAllowedPacketReached.call(host, sql, previousPacket)) {
      chunks.push(sql);
    } else {
      chunks[chunks.length - 1] = `${previousPacket};\n${sql}`;
    }
  }
  return chunks;
}

/** @internal */
export async function isMaxAllowedPacketReached(
  this: MaxAllowedPacketHost | void,
  currentPacket: string,
  previousPacket: string | undefined,
): Promise<boolean> {
  const host = this ?? undefined;
  // Rails resolves `max_allowed_packet` on self; the receiver only carries it
  // once the module is mixed in, so a bare host falls back to the free function.
  const maxPacket = host?.maxAllowedPacket
    ? await host.maxAllowedPacket()
    : await maxAllowedPacket.call(host);
  const currentSize = Buffer.byteLength(currentPacket, "utf8");
  if (currentSize > maxPacket) {
    throw new Error(
      `Fixtures set is too large ${currentSize}. Consider increasing the max_allowed_packet variable.`,
    );
  }
  if (previousPacket === undefined) return true;
  return currentSize + Buffer.byteLength(previousPacket, "utf8") + 2 > maxPacket;
}

/** @internal */
export async function maxAllowedPacket(this: MaxAllowedPacketHost | void): Promise<number> {
  const host = this ?? undefined;
  if (host?._maxAllowedPacket !== undefined) return host._maxAllowedPacket;
  const raw = await host?.showVariable?.("max_allowed_packet");
  const parsed = raw != null ? parseInt(raw, 10) : NaN;
  // Rails needs no fallback: `show_variable` always answers on a live MySQL
  // connection. The MySQL default stands in for a host without one.
  const resolved = Number.isNaN(parsed) ? 16_777_216 : parsed;
  if (host) host._maxAllowedPacket = resolved;
  return resolved;
}

/**
 * Returns a SQL literal for MySQL's highest-precision current timestamp.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements#high_precision_current_timestamp
 */
export function highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
  return arelSql("CURRENT_TIMESTAMP(6)");
}

/**
 * Returns an EXPLAIN plan for the query.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements#explain
 */
export async function explain(
  this: BuildExplainClauseHost & {
    explainPrettyPrinter?(): { pp(result: Result, elapsed: number): string };
  },
  arel: unknown,
  binds: unknown[] = [],
  options: ExplainOption[] = [],
): Promise<string> {
  const sql =
    buildExplainClause.call(this, options) + " " + abstractToSql.call(this as any, arel, binds);
  const start = Date.now();
  const result = await internalExecQuery.call(this as any, String(sql), "EXPLAIN", binds);
  const elapsed = (Date.now() - start) / 1000;
  return this.explainPrettyPrinter?.().pp(result, elapsed) ?? JSON.stringify(result.rows);
}
