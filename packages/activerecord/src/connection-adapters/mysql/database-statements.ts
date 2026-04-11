/**
 * MySQL database statements — MySQL-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::MySQL::DatabaseStatements (module)
 */

import type { Result } from "../../result.js";

export interface DatabaseStatements {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execInsert(sql: string, name?: string | null, binds?: unknown[], pk?: string): Promise<unknown>;
  explain(sql: string, binds?: unknown[], options?: { extended?: boolean }): Promise<string>;
  lastInsertedId(result: unknown): number;
}
