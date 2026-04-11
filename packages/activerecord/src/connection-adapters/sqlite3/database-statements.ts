/**
 * SQLite3 database statements — SQLite-specific query execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::SQLite3::DatabaseStatements
 */

import type { Result } from "../../result.js";

export interface DatabaseStatements {
  execQuery(sql: string, name?: string | null): Promise<Result>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execInsert(sql: string, name?: string | null, binds?: unknown[], pk?: string): Promise<unknown>;
  explain(sql: string, binds?: unknown[]): Promise<string>;
  lastInsertedId(result: unknown): number;
}
