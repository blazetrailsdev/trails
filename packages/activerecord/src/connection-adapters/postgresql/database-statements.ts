/**
 * PostgreSQL database statements — PostgreSQL-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements
 */

import type { Nodes } from "@blazetrails/arel";
import type { ExplainOption } from "../../adapter.js";
import type { Result } from "../../result.js";

// Mirrors: PostgreSQL::DatabaseStatements::READ_QUERY (database_statements.rb:19-21)
// Mirrors Rails' build_read_query_regexp which combines the default read list
// (begin, commit, explain, release, rollback, savepoint, select) with
// the PG-specific additions (close, declare, fetch, move, set, show).
// Matches Rails exactly: `with` is included in the read list.
// Rails does not perform deep CTE analysis — data-modifying CTEs starting
// with WITH are treated as read-only, the same as pure-read CTEs. This
// mirrors DEFAULT_READ_QUERY + PG additions from build_read_query_regexp.
// Leading whitespace, block/line comments, and opening parentheses are
// allowed before the keyword in any order.
export const READ_QUERY =
  /^(?:\s|\/\*.*?\*\/|--[^\n]*(?:\n|$)|\()*(?:begin|close|commit|declare|explain|fetch|move|release|rollback|savepoint|select|set|show|with)\b/is;

export interface DatabaseStatements {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string,
    sequenceName?: string,
  ): Promise<unknown>;
  // Mirrors: database_statements.rb:7
  explain(
    sql: string,
    binds?: unknown[],
    options?: {
      analyze?: boolean;
      verbose?: boolean;
      costs?: boolean;
      buffers?: boolean;
      format?: string;
    },
  ): Promise<string>;
  // Mirrors: database_statements.rb:14
  query(sql: string, name?: string | null): Promise<unknown[][]>;
  executeAndClear(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
  // Mirrors: database_statements.rb:24
  isWriteQuery(sql: string): boolean;
  // Mirrors: database_statements.rb:39
  execute(sql: string, binds?: unknown[], name?: string | null): Promise<unknown[]>;
  // Mirrors: database_statements.rb:64
  beginDbTransaction(): Promise<void>;
  // Mirrors: database_statements.rb:68
  beginIsolatedDbTransaction(isolation: string): Promise<void>;
  // Mirrors: database_statements.rb:73
  commitDbTransaction(): Promise<void>;
  // Mirrors: database_statements.rb:78
  execRollbackDbTransaction(): Promise<void>;
  // Mirrors: database_statements.rb:83
  execRestartDbTransaction(): Promise<void>;
  // Mirrors: database_statements.rb:92
  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral;
  // Mirrors: database_statements.rb:96
  buildExplainClause(options?: ExplainOption[]): string;
  // Mirrors: database_statements.rb:110
  setConstraints(deferred: "deferred" | "immediate", ...constraints: string[]): Promise<void>;
}
