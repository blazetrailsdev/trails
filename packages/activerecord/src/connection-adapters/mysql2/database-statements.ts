/**
 * Mysql2 database statements — Mysql2-specific query execution overrides.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements (module)
 */

import type mysql from "mysql2/promise";
import { NotImplementedError } from "../../errors.js";
import { Result } from "../../result.js";

export interface DatabaseStatementsHost {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  preparedStatements?: boolean;
}

/** @internal */
export interface Mysql2RawResult {
  rows: Record<string, unknown>[] | null;
  fields: Array<{ name: string }>;
  affectedRows: number;
}

/** @internal */
interface PerformQueryHost {
  _affectedRowsBeforeWarnings?: number;
  _statements?: Map<string, unknown>;
  handleWarnings?(sql: string): void;
  verified?(): void;
}

/** @internal */
interface MultiStatementsHost {
  _config?: { flags?: string | string[] | number };
}

// Mysql2::Client::MULTI_STATEMENTS bitmask value from the Ruby gem.
const MULTI_STATEMENTS_BIT = 0x10000;

/**
 * Returns an ActiveRecord::Result instance.
 * Rails also wraps in `unprepared_statement` when collecting EXPLAIN with
 * prepared statements, but that path is deferred pending ExplainRegistry wiring.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#select_all
 */
export async function selectAll(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<Result> {
  return this.execQuery(sql, name, binds);
}

/** @internal */
function executeBatch(statements: any, name?: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#execute_batch is not implemented",
  );
}

/** @internal */
function lastInsertedId(result: any): never {
  throw new NotImplementedError(
    "ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#last_inserted_id is not implemented",
  );
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#multi_statements_enabled?
 * @internal
 */
export function multiStatementsEnabled(this: MultiStatementsHost): boolean {
  const flags = this._config?.flags;
  if (Array.isArray(flags)) return (flags as string[]).includes("MULTI_STATEMENTS");
  if (typeof flags === "number") return (flags & MULTI_STATEMENTS_BIT) !== 0;
  return false;
}

/**
 * Rails' `set_server_option` batch toggle is elided — node-mysql2 only supports
 * multi-statements as a connection-creation option, not at runtime.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#perform_query
 * @internal
 */
export async function performQuery(
  this: PerformQueryHost,
  rawConnection: mysql.PoolConnection | mysql.Connection,
  sql: string,
  binds: unknown[],
  typeCastedBinds: unknown[],
  options: {
    prepare?: boolean;
    notificationPayload?: Record<string, unknown>;
    batch?: boolean;
  } = {},
): Promise<Mysql2RawResult> {
  const { prepare = false, notificationPayload } = options;
  const hasBinds = binds != null && binds.length > 0;

  let rows: Record<string, unknown>[] | null = null;
  let fields: Array<{ name: string }> = [];
  let affectedRows = 0;

  if (!hasBinds) {
    // Avoid #affected_rows when result exists — sidesteps gem 0.5.6 GVL race (brianmario/mysql2#1383).
    const [result, resultFields] = (await rawConnection.query(sql)) as [
      mysql.RowDataPacket[] | mysql.ResultSetHeader,
      mysql.FieldPacket[],
    ];
    if (Array.isArray(result)) {
      rows = result as Record<string, unknown>[];
      fields = (resultFields ?? []) as Array<{ name: string }>;
      affectedRows = rows.length;
    } else {
      affectedRows = (result as mysql.ResultSetHeader).affectedRows ?? 0;
    }
  } else if (prepare) {
    try {
      const [result, resultFields] = (await rawConnection.execute(
        sql,
        typeCastedBinds as any[],
      )) as [mysql.RowDataPacket[] | mysql.ResultSetHeader, mysql.FieldPacket[]];
      if (Array.isArray(result)) {
        rows = result as Record<string, unknown>[];
        fields = (resultFields ?? []) as Array<{ name: string }>;
        affectedRows = rows.length;
      } else {
        affectedRows = (result as mysql.ResultSetHeader).affectedRows ?? 0;
      }
    } catch (err) {
      this._statements?.delete(sql); // mirrors Rails' @statements.delete(sql) rescue
      throw err;
    }
  } else {
    const [result, resultFields] = (await rawConnection.execute(sql, typeCastedBinds as any[])) as [
      mysql.RowDataPacket[] | mysql.ResultSetHeader,
      mysql.FieldPacket[],
    ];
    if (Array.isArray(result)) {
      rows = result as Record<string, unknown>[];
      fields = (resultFields ?? []) as Array<{ name: string }>;
      affectedRows = rows.length;
    } else {
      affectedRows = (result as mysql.ResultSetHeader).affectedRows ?? 0;
    }
  }

  this._affectedRowsBeforeWarnings = affectedRows;

  if (notificationPayload) {
    notificationPayload["affected_rows"] = this._affectedRowsBeforeWarnings;
    notificationPayload["row_count"] = rows?.length ?? 0;
  }

  this.verified?.();
  this.handleWarnings?.(sql);

  return { rows, fields, affectedRows };
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#cast_result
 * @internal
 */
export function castResult(rawResult: Mysql2RawResult): Result {
  if (rawResult.rows == null) return Result.empty();

  const fields = rawResult.fields.map((f) => f.name);
  const result = fields.length === 0 ? Result.empty() : Result.fromRowHashes(rawResult.rows);

  freeRawResult(rawResult);

  return result;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#affected_rows
 * @internal
 */
export function affectedRows(this: PerformQueryHost, rawResult: Mysql2RawResult): number {
  if (rawResult) freeRawResult(rawResult);
  return this._affectedRowsBeforeWarnings ?? 0;
}

/**
 * No-op in TS: node-mysql2 GCs results and manages stmt lifecycle automatically.
 * Rails calls `result.free` + COM_STMT_CLOSE via `@_ar_stmt_to_close`.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#free_raw_result
 * @internal
 */
export function freeRawResult(_rawResult: Mysql2RawResult): void {}
