import type { Type } from "@blazetrails/activemodel";
import type mysql from "mysql2/promise";
import { Result, type ColumnTypes } from "../../result.js";
import { combineMultiStatements, type MaxAllowedPacketHost } from "../mysql/database-statements.js";
import { lastInsertedId as abstractLastInsertedId } from "../abstract/database-statements.js";
import type { StatementPool } from "../statement-pool.js";
import { ActiveRecord } from "../../ar-config.js";

export interface DatabaseStatementsHost {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  preparedStatements?: boolean;
}

/** @internal */
export interface Mysql2FieldDescriptor {
  name: string;
  type?: number;
  columnType?: number;
  decimals?: number;
}

/** @internal */
export interface Mysql2RawResult {
  rows: unknown[][] | null;
  fields: Mysql2FieldDescriptor[];
  affectedRows: number;
  insertId?: number;
}

/** @internal */
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
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
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
  _databaseTimezone?: "utc" | "local";
  _affectedRowsBeforeWarnings?: number;
  _lastId?: number;
  _statements?: StatementPool | null;
  handleWarnings?(sql: string): void | Promise<void>;
  verified?(): void;
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

const MULTI_STATEMENTS_BIT = 0x10000;

/** @missingRailsCall unprepared_statement — PERMANENT */
export async function selectAll(
  this: DatabaseStatementsHost,
  sql: string,
  name?: string | null,
  binds?: unknown[],
): Promise<Result> {
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

/** @internal */
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

/** @internal */
export async function lastInsertedId(this: LastInsertedIdHost, result: Result): Promise<unknown> {
  if (await this.supportsInsertReturning()) {
    return abstractLastInsertedId(result);
  }
  return this._lastId;
}

/** @internal */
export function isMultiStatementsEnabled(this: MultiStatementsHost): boolean {
  const flags = this._config?.flags;
  if (Array.isArray(flags)) return flags.includes("MULTI_STATEMENTS");
  if (typeof flags === "number") return (flags & MULTI_STATEMENTS_BIT) !== 0;
  return false;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE inline-ruby-bodies-extracted-as-named-helpers
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

/** @internal */
export async function performQuery(
  this: PerformQueryHost,
  rawConnection: mysql.PoolConnection | mysql.Connection,
  sql: string,
  binds: unknown[],
  typeCastedBinds: unknown[],
  {
    prepare,
    notificationPayload,
  }: {
    prepare: boolean;
    notificationPayload?: Record<string, unknown>;
    batch?: boolean;
  },
): Promise<Mysql2RawResult> {
  this._databaseTimezone = ActiveRecord.defaultTimezone;

  const hasBinds = binds != null && binds.length > 0;

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
      this._statements?.delete(sql);
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

/** @internal */
export function castResult(
  this: { lookupCastType(sqlType: string): Type | Promise<Type> | null },
  rawResult: Mysql2RawResult,
): Result {
  if (rawResult.rows == null) return Result.empty();

  const fields = rawResult.fields;

  const result =
    fields.length === 0
      ? Result.empty()
      : new Result(
          fields.map((f) => f.name),
          rawResult.rows,
          buildColumnTypes(fields, (t) => this.lookupCastType(t) as Type),
        );

  freeRawResult(rawResult);

  return result;
}

/** @internal */
export function affectedRows(this: PerformQueryHost, rawResult: Mysql2RawResult): number {
  if (rawResult) freeRawResult(rawResult);
  return this._affectedRowsBeforeWarnings ?? 0;
}

/** @internal */
export function freeRawResult(_rawResult: Mysql2RawResult): void {}
