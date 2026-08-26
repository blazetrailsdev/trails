/**
 * Mysql2 database statements — Mysql2-specific query execution overrides.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements (module)
 */

import type { Type } from "@blazetrails/activemodel";
import type mysql from "mysql2/promise";
import { Result, type ColumnTypes } from "../../result.js";
import { combineMultiStatements, type MaxAllowedPacketHost } from "../mysql/database-statements.js";
import { lastInsertedId as abstractLastInsertedId } from "../abstract/database-statements.js";
import type { StatementPool } from "../statement-pool.js";

export interface DatabaseStatementsHost {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
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
  // The driver's `insertId` from a non-row-returning statement's
  // ResultSetHeader — 0/undefined for a SELECT. Sourced by `execInsert`'s write
  // path (mysql2_adapter.rb's `last_inserted_id`).
  insertId?: number;
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
  0: "decimal",
  246: "decimal",
  4: "float",
  5: "double",
  1: "tinyint",
  2: "smallint",
  9: "mediumint",
  3: "int",
  8: "bigint",
  13: "year",
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
    if (sqlType === "decimal" && typeof f.decimals === "number" && f.decimals > 0) {
      sqlType = `decimal(65,${f.decimals})`;
    }
    const type = lookupCastType(sqlType);
    columnTypes ??= {};
    columnTypes[i] = type;
    if (!/^\d+$/.test(f.name)) columnTypes[f.name] = type;
  }
  return columnTypes;
}

/** @internal */
interface PerformQueryHost {
  _affectedRowsBeforeWarnings?: number;
  _lastId?: number;
  /** Rails' `@statements` (abstract_adapter.rb:156). */
  _statements?: StatementPool | null;
  handleWarnings?(sql: string): void | Promise<void>;
  verified?(): void;
  preparedStatements?: boolean;
  _trackPrepared?(conn: unknown, sql: string): void;
}

/** @internal */
interface LastInsertedIdHost {
  _lastId?: number;
  supportsInsertReturning(): Promise<boolean>;
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
 *
 * @missingRailsCall unprepared_statement — PERMANENT: Per-site verified (RFC
 *   0106 wave 4b): mysql2/database_statements.rb's `select_all` wraps the super
 *   call in `unprepared_statement { }` when the arel is not preparable; trails'
 *   Mysql2 select_all delegates to the abstract implementation, which owns the
 *   unprepared-statement guard (abstract/database-statements.ts), so the block
 *   is applied one level up.
 */
export async function selectAll(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<Result> {
  // Rails' `select_all` calls `super` → `internal_exec_query`, NOT the public
  // `exec_query` (which `dirties_query_cache` wraps) — routing through the
  // public method would clear the query cache on every read.
  return this.internalExecQuery(sql, name, binds);
}

/** @internal */
interface ExecuteBatchHost extends MaxAllowedPacketHost {
  rawExecute(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    prepare?: boolean,
    async?: boolean,
    allowRetry?: boolean,
    materializeTransactions?: boolean,
    batch?: boolean,
  ): Promise<unknown>;
}

/**
 * Combines statements via `combineMultiStatements` then hands each combined
 * block to `raw_execute` with `batch: true`.
 *
 * Going through `raw_execute` rather than `execute` is what leaves batch
 * statements uncommented — `preprocess_query`, which runs the
 * query_transformers, is `internal_execute`'s step
 * (abstract/database_statements.rb:589-591) — so the `_inQueryTransformers`
 * suppression flag this used to need is gone with it.
 *
 * The positional arguments below are `raw_execute`'s own defaults
 * (abstract/database_statements.rb:552).
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#execute_batch
 * (mysql2/database_statements.rb:17-21)
 * @internal
 */
export async function executeBatch(
  this: ExecuteBatchHost,
  statements: string[],
  name: string | null = null,
  {
    allowRetry = false,
    materializeTransactions = true,
  }: { allowRetry?: boolean; materializeTransactions?: boolean } = {},
): Promise<void> {
  for (const statement of await combineMultiStatements.call(this, statements)) {
    await this.rawExecute(
      statement,
      name,
      [],
      false,
      false,
      allowRetry,
      materializeTransactions,
      true,
    );
  }
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#last_inserted_id
 * (mysql2/database_statements.rb:22-29)
 *
 * Ruby's `@raw_connection&.last_id` reads the driver's own session accessor;
 * the node mysql2 client exposes the value only on the result header, so
 * `perform_query` above stashes it as `_lastId` — the same session-scoped
 * "id of the last INSERT on this connection" the Ruby accessor returns.
 *
 * @internal
 */
export async function lastInsertedId(this: LastInsertedIdHost, result: Result): Promise<unknown> {
  if (await this.supportsInsertReturning()) {
    return abstractLastInsertedId(result);
  }
  return this._lastId;
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#multi_statements_enabled?
 * @internal
 */
export function isMultiStatementsEnabled(this: MultiStatementsHost): boolean {
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
  const { notificationPayload } = options;
  // Rails' `raw_execute` always states `prepare:`; where a trails caller does
  // not, fall back to Rails' own gate, `prepared_statements && preparable`
  // (abstract/database_statements.rb:74).
  const prepare = options.prepare ?? (this.preparedStatements === true && binds.length > 0);
  const hasBinds = binds != null && binds.length > 0;

  // Rails' prepared arm is `@statements[sql] ||= raw_connection.prepare(sql)`
  // (mysql2/database_statements.rb:70); node-mysql2 prepares inside `execute`,
  // so the pool is tracked here instead, before the statement is handed over —
  // an eviction then sends COM_STMT_CLOSE while the entry is still ours.
  if (prepare) this._trackPrepared?.(rawConnection, sql);

  let rawResult: unknown;
  let rawFields: mysql.FieldPacket[] | undefined;
  if (!hasBinds) {
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
  let insertId: number | undefined;
  if (Array.isArray(result)) {
    rows = result as unknown[][];
    fieldList = (fields ?? []) as unknown as Mysql2FieldDescriptor[];
    affectedRows = rows.length;
  } else {
    affectedRows = result.affectedRows ?? 0;
    insertId = result.insertId;
  }

  this._affectedRowsBeforeWarnings = affectedRows;
  if (insertId !== undefined) this._lastId = insertId;

  if (notificationPayload) {
    notificationPayload["affected_rows"] = this._affectedRowsBeforeWarnings;
    notificationPayload["row_count"] = rows?.length ?? 0;
  }

  this.verified?.();
  await this.handleWarnings?.(sql);

  return { rows, fields: fieldList, affectedRows, insertId };
}

/**
 * Mirrors: ActiveRecord::ConnectionAdapters::Mysql2::DatabaseStatements#cast_result
 * @internal
 */
export function castResult(
  this: { lookupCastType(sqlType: string): Type | Promise<Type> | null },
  rawResult: Mysql2RawResult,
): Result {
  if (rawResult.rows == null) return Result.empty();

  // Rows are already positional (array-mode), mirroring Rails' `result.to_a`,
  // so build the Result directly from `result.fields` + rows — no row[col]
  // re-keying, which would collapse duplicate column names.
  const fields = rawResult.fields;

  const result =
    fields.length === 0
      ? Result.empty()
      : new Result(
          fields.map((f) => f.name),
          rawResult.rows,
          // MySQL's `lookup_cast_type` is the plain type-map lookup
          // (abstract/quoting.rb:234-236); only PostgreSQL's override is
          // awaitable, and it never reaches this MySQL-only helper.
          buildColumnTypes(fields, (t) => this.lookupCastType(t) as Type),
        );

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
