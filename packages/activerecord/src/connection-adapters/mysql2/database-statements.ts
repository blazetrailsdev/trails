/**
 * Mysql2 database statements — Mysql2-specific query execution overrides.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements (module)
 */

import type mysql from "mysql2/promise";
import { NotImplementedError } from "../../errors.js";
import { Result } from "../../result.js";
import { combineMultiStatements } from "../mysql/database-statements.js";

export interface DatabaseStatementsHost {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  preparedStatements?: boolean;
}

/** @internal */
export interface Mysql2RawResult {
  // Array-mode (positional) rows, mirroring Rails' `query_options[:as] = :array`
  // feeding `cast_result` from `result.to_a`. Positional rows keep duplicate
  // column names (`SELECT 1 AS a, 2 AS a`) that hash-keyed rows would collapse.
  rows: unknown[][] | null;
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
  _config?: { flags?: string[] | number };
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

/**
 * Combines statements via `combineMultiStatements` then executes each block.
 * Mirrors Rails' use of `multi_statement: true` for batched execution.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#execute_batch
 * @internal
 */
export async function executeBatch(
  this: { execute(sql: string, name?: string | null): Promise<unknown> },
  statements: string[],
  name?: string | null,
): Promise<void> {
  for (const statement of combineMultiStatements(statements)) {
    await this.execute(statement, name);
  }
}

/** @internal */
function lastInsertedId(result: any): never {
  // @nie disposition=port-real rails=activerecord/lib/active_record/connection_adapters/mysql2/database_statements.rb:23 cluster=mysql-mysql2-adapter
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
  if (Array.isArray(flags)) return flags.includes("MULTI_STATEMENTS");
  if (typeof flags === "number") return (flags & MULTI_STATEMENTS_BIT) !== 0;
  return false;
}

/**
 * Unwraps mysql2's nested result sets from a CALL / multi-statement query so
 * callers see the single result set Rails' `cast_result` reads. For a plain
 * non-CALL query `rawFields` is a flat `FieldPacket[]`, so `rawFields[0]` is a
 * `FieldPacket` (not an array) and neither branch fires. CALL wraps rows AND
 * fields in parallel nested arrays: take the first set (Rails' `abandon_results!`
 * + first-result semantics), using `rawFields[0]` for the field descriptors
 * (or undefined for DML-only, matching Rails' `fields.empty?` check).
 * @internal
 */
export function unwrapMultiResult(
  rawResult: unknown,
  rawFields: mysql.FieldPacket[] | undefined,
): {
  result: mysql.RowDataPacket[] | mysql.ResultSetHeader;
  fields: mysql.FieldPacket[] | undefined;
} {
  let result = rawResult as mysql.RowDataPacket[] | mysql.ResultSetHeader;
  let fields = rawFields;
  if (Array.isArray(rawFields) && Array.isArray(rawFields[0])) {
    result = (rawResult as unknown[])[0] as mysql.RowDataPacket[];
    fields = rawFields[0] as mysql.FieldPacket[];
  } else if (Array.isArray(rawFields) && rawFields[0] === undefined && Array.isArray(rawResult)) {
    result = (rawResult as unknown[])[0] as mysql.ResultSetHeader;
  }
  return { result, fields };
}

/**
 * Rails' `set_server_option` batch toggle is elided — node-mysql2 only supports
 * multi-statements as a connection-creation option, not at runtime.
 *
 * Requests array-mode rows (`rowsAsArray: true`) so duplicate column names
 * survive, mirroring Rails' `configure_connection` `query_options[:as] = :array`.
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

  let rawResult: unknown;
  let rawFields: mysql.FieldPacket[] | undefined;
  if (!hasBinds) {
    // Avoid #affected_rows when result exists — sidesteps gem 0.5.6 GVL race (brianmario/mysql2#1383).
    [rawResult, rawFields] = (await rawConnection.query({
      sql,
      rowsAsArray: true,
    } as any)) as [unknown, mysql.FieldPacket[]];
  } else if (prepare) {
    try {
      [rawResult, rawFields] = (await rawConnection.execute(
        { sql, rowsAsArray: true } as any,
        typeCastedBinds as any[],
      )) as [unknown, mysql.FieldPacket[]];
    } catch (err) {
      this._statements?.delete(sql); // mirrors Rails' @statements.delete(sql) rescue
      throw err;
    }
  } else {
    [rawResult, rawFields] = (await rawConnection.query(
      { sql, rowsAsArray: true } as any,
      typeCastedBinds as any[],
    )) as [unknown, mysql.FieldPacket[]];
  }

  const { result, fields } = unwrapMultiResult(rawResult, rawFields);
  let rows: unknown[][] | null = null;
  let fieldList: Array<{ name: string }> = [];
  let affectedRows = 0;
  if (Array.isArray(result)) {
    rows = result as unknown[][];
    fieldList = (fields ?? []) as Array<{ name: string }>;
    affectedRows = rows.length;
  } else {
    affectedRows = result.affectedRows ?? 0;
  }

  this._affectedRowsBeforeWarnings = affectedRows;

  if (notificationPayload) {
    notificationPayload["affected_rows"] = this._affectedRowsBeforeWarnings;
    notificationPayload["row_count"] = rows?.length ?? 0;
  }

  this.verified?.();
  this.handleWarnings?.(sql);

  return { rows, fields: fieldList, affectedRows };
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#cast_result
 * @internal
 */
export function castResult(rawResult: Mysql2RawResult): Result {
  if (rawResult.rows == null) return Result.empty();

  // Rows are already positional (array-mode), mirroring Rails' `result.to_a`,
  // so build the Result directly from `result.fields` + rows — no row[col]
  // re-keying, which would collapse duplicate column names.
  const columns = rawResult.fields.map((f) => f.name);
  const result = columns.length === 0 ? Result.empty() : new Result(columns, rawResult.rows);
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
 * No-op: node-mysql2 GCs results automatically; no equivalent for Rails'
 * `raw_result.free` + `@_ar_stmt_to_close.close`.
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#free_raw_result
 * @internal
 */
export function freeRawResult(_rawResult: Mysql2RawResult): void {}
