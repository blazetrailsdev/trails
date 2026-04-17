/**
 * DatabaseStatements mixin — adds Rails-compatible query methods to any adapter.
 *
 * Provides default implementations of selectAll, selectOne, selectValue, etc.
 * that delegate to the adapter's execute()/executeMutation() methods.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::DatabaseStatements
 */

import { isWriteQuerySql } from "./sql-classification.js";
import { Result } from "../result.js";

/**
 * Minimum interface required by the mixin — the base class must provide
 * execute() and executeMutation() for delegation.
 */
interface ExecutionMethods {
  execute(sql: string, binds?: unknown[]): Promise<Record<string, unknown>[]>;
  executeMutation(sql: string, binds?: unknown[]): Promise<number>;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * Adds DatabaseStatements methods to a concrete adapter class.
 * Usage: class MyAdapter extends DatabaseStatementsMixin(BaseClass) { ... }
 *
 * The base class should provide execute()/executeMutation(). If the mixin
 * is applied to a bare class {}, the concrete subclass must provide them.
 */

export function DatabaseStatementsMixin<T extends Constructor<any>>(Base: T) {
  return class extends Base {
    async selectAll(sql: string, name?: string | null, binds?: unknown[]): Promise<Result> {
      // Rails: select_all → internal_exec_query → exec_query. Delegating
      // here means adapters that override execQuery (e.g. PostgreSQLAdapter,
      // which populates columnTypes via its type_map) have their override
      // picked up automatically, matching Rails' behavior.
      return this.execQuery(sql, name, binds);
    }

    async selectOne(
      sql: string,
      _name?: string | null,
      binds?: unknown[],
    ): Promise<Record<string, unknown> | undefined> {
      const rows = await (this as unknown as ExecutionMethods).execute(sql, binds);
      return rows[0];
    }

    async selectValue(sql: string, _name?: string | null, binds?: unknown[]): Promise<unknown> {
      const rows = await (this as unknown as ExecutionMethods).execute(sql, binds);
      if (rows.length === 0) return undefined;
      const keys = Object.keys(rows[0]);
      return keys.length > 0 ? rows[0][keys[0]] : undefined;
    }

    async selectValues(sql: string, _name?: string | null, binds?: unknown[]): Promise<unknown[]> {
      const rows = await (this as unknown as ExecutionMethods).execute(sql, binds);
      if (rows.length === 0) return [];
      const firstKey = Object.keys(rows[0])[0];
      if (firstKey === undefined) return rows.map(() => undefined);
      return rows.map((row) => row[firstKey]);
    }

    async selectRows(sql: string, _name?: string | null, binds?: unknown[]): Promise<unknown[][]> {
      const rows = await (this as unknown as ExecutionMethods).execute(sql, binds);
      if (rows.length === 0) return [];
      const keys = Object.keys(rows[0]);
      return rows.map((row) => keys.map((key) => row[key]));
    }

    async execQuery(sql: string, _name?: string | null, binds?: unknown[]): Promise<Result> {
      const rows = await (this as unknown as ExecutionMethods).execute(sql, binds);
      return Result.fromRowHashes(rows);
    }

    async execInsert(sql: string, _name?: string | null, binds?: unknown[]): Promise<number> {
      return (this as unknown as ExecutionMethods).executeMutation(sql, binds);
    }

    async execDelete(sql: string, _name?: string | null, binds?: unknown[]): Promise<number> {
      return (this as unknown as ExecutionMethods).executeMutation(sql, binds);
    }

    async execUpdate(sql: string, _name?: string | null, binds?: unknown[]): Promise<number> {
      return (this as unknown as ExecutionMethods).executeMutation(sql, binds);
    }

    isWriteQuery(sql: string): boolean {
      return isWriteQuerySql(sql);
    }

    emptyInsertStatementValue(_pk?: string | null): string {
      return "DEFAULT VALUES";
    }
  };
}
