/**
 * PostgreSQL database statements — PostgreSQL-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::DatabaseStatements
 */

import type { Result } from "../../result.js";

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
  query(sql: string, name?: string | null): Promise<unknown[][]>;
  executeAndClear(sql: string, name?: string | null, binds?: unknown[]): Promise<unknown>;
}
