/**
 * Mysql2 database statements — Mysql2-specific query execution overrides.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements (module)
 */

import type { Type } from "@blazetrails/activemodel";
import type mysql from "mysql2/promise";
import { NotImplementedError } from "../../errors.js";
import { Result, type ColumnTypes } from "../../result.js";
import { combineMultiStatements } from "../mysql/database-statements.js";

export interface DatabaseStatementsHost {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  preparedStatements?: boolean;
}

/**
 * Field descriptor metadata we keep from node-mysql2's `FieldPacket` so the
 * adapter can report `column_types`. node-mysql2 exposes a numeric `type` (and,
 * for prepared statements, `columnType`) field-type code plus `decimals` for
 * the scale of a `DECIMAL`/`NEWDECIMAL` column.
 * @internal
 */
export interface Mysql2FieldDescriptor {
  name: string;
  type?: number;
  columnType?: number;
  decimals?: number;
}

/** @internal */
export interface Mysql2RawResult {
  // Array-mode (positional) rows, mirroring Rails' `query_options[:as] = :array`
  // feeding `cast_result` from `result.to_a`. Positional rows keep duplicate
  // column names (`SELECT 1 AS a, 2 AS a`) that hash-keyed rows would collapse.
  rows: unknown[][] | null;
  fields: Mysql2FieldDescriptor[];
  affectedRows: number;
}

/**
 * node-mysql2 field-type codes (a subset of mysql2/lib/constants/types.js) for
 * the numeric families. We map these to a trails sql_type string so
 * `lookupCastType` builds the faithful `Type` — `DECIMAL`/`NEWDECIMAL` →
 * `BigDecimal`, `FLOAT`/`DOUBLE`/integers → number.
 *
 * Only `DECIMAL`/`NEWDECIMAL` fixes an actual divergence: node-mysql2 with
 * `decimalNumbers:false` returns decimals as raw strings, whereas the Ruby
 * mysql2 gem yields `BigDecimal`. The integer (1/2/3/8/9/13) and float (4/5)
 * codes are deliberately included for column_types parity even though they are
 * no-ops over values node-mysql2 already returns as JS numbers — the story's
 * acceptance criteria asks for the faithful numeric `Type` on every extra
 * numeric select, and this mirrors the PostgreSQL adapter's `cast_result`, which
 * reports a `Type` for every column via its OID map. The per-column
 * `lookupCastType` is a cheap type-map lookup. Non-numeric families (string,
 * blob, date/time) are intentionally absent so their driver value passes through
 * unchanged — matching Rails' `Mysql2Adapter#cast_result`, which builds no
 * column_types at all and relies on the gem's driver-level casting.
 * @internal
 */
const MYSQL_NUMERIC_FIELD_SQL_TYPE: Readonly<Record<number, string>> = {
  0: "decimal", // DECIMAL
  246: "decimal", // NEWDECIMAL
  4: "float", // FLOAT
  5: "double", // DOUBLE
  1: "tinyint", // TINY
  2: "smallint", // SHORT
  9: "mediumint", // INT24
  3: "int", // LONG
  8: "bigint", // LONGLONG
  13: "year", // YEAR
};

/**
 * Build a `Result` `column_types` map from node-mysql2 field descriptors,
 * mapping the numeric field-type codes to trails `Type` instances via the
 * adapter's `lookupCastType`. Returns `null` when no field carries a mapped
 * numeric type, so a plain string/blob result allocates nothing and falls back
 * to the driver value. Keyed by both positional index and column name, mirroring
 * the PostgreSQL adapter's `cast_result` (which Rails' `column_types` slicing
 * reads by name in `JoinDependency#instantiate`).
 * @internal
 */
export function buildColumnTypes(
  fields: ReadonlyArray<Mysql2FieldDescriptor>,
  lookupCastType: (sqlType: string) => Type,
): ColumnTypes | null {
  let columnTypes: Record<string | number, Type> | null = null;
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i];
    const code = f.columnType ?? f.type;
    if (code == null) continue;
    let sqlType = MYSQL_NUMERIC_FIELD_SQL_TYPE[code];
    if (sqlType == null) continue;
    // Honor a decimal column's scale so cast truncates to the right places
    // (precision 65 is MySQL's DECIMAL maximum — the scale is what matters).
    // `decimals === 0` (a `DECIMAL(n,0)`) is intentionally left to the bare
    // `decimal` lookup: it still builds a BigDecimal, just without an explicit
    // scale, so no truncation is needed.
    if (sqlType === "decimal" && typeof f.decimals === "number" && f.decimals > 0) {
      sqlType = `decimal(65,${f.decimals})`;
    }
    const type = lookupCastType(sqlType);
    columnTypes ??= {};
    columnTypes[i] = type;
    // Guard a column literally named "1" from colliding with integer index 1.
    if (!/^\d+$/.test(f.name)) columnTypes[f.name] = type;
  }
  return columnTypes;
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
  let fieldList: Mysql2FieldDescriptor[] = [];
  let affectedRows = 0;
  if (Array.isArray(result)) {
    rows = result as unknown[][];
    fieldList = (fields ?? []) as unknown as Mysql2FieldDescriptor[];
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
export function castResult(
  this: { lookupCastType(sqlType: string): Type },
  rawResult: Mysql2RawResult,
): Result {
  if (rawResult.rows == null) return Result.empty();

  // Rows are already positional (array-mode), mirroring Rails' `result.to_a`,
  // so build the Result directly from `result.fields` + rows — no row[col]
  // re-keying, which would collapse duplicate column names.
  const columns = rawResult.fields.map((f) => f.name);
  if (columns.length === 0) {
    freeRawResult(rawResult);
    return Result.empty();
  }
  const columnTypes = buildColumnTypes(rawResult.fields, (t) => this.lookupCastType(t));
  const result = new Result(columns, rawResult.rows, columnTypes);
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
