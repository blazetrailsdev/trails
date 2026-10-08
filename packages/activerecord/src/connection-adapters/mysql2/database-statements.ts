import type mysql from "mysql2/promise";
import { Result } from "../../result.js";
import { combineMultiStatements, type MaxAllowedPacketHost } from "../mysql/database-statements.js";
import { lastInsertedId as abstractLastInsertedId } from "../abstract/database-statements.js";
import { anybits } from "@blazetrails/ruby-compat";
import type { StatementPool } from "../statement-pool.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { TimeWithZone } from "@blazetrails/activesupport";
import { defaultTimezone } from "../../active-record.js";
import { ExplainRegistry } from "../../explain-registry.js";

export interface DatabaseStatementsHost {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  preparedStatements?: boolean;
}

/** @internal */
export interface Mysql2RawResult {
  rows: unknown[][] | null;
  fields: string[];
  toA(): unknown[][];
  affectedRows: number;
  insertId?: number;
  _arStmtToClose?: { close(): void };
}

/** @internal */
interface PerformQueryHost {
  _databaseTimezone?: "utc" | "local";
  _affectedRowsBeforeWarnings?: number | null;
  _lastId?: number;
  _statements?: StatementPool | null;
  handleWarnings?(sql: string): void | Promise<void>;
  verified?(): void;
  _trackPrepared?(conn: unknown, sql: string): void;
  quotedDate(value: unknown): string;
  _config?: { readTimeout?: number };
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

const MULTI_STATEMENTS = 0x10000;

/** @internal */
interface SelectAllHost {
  preparedStatements?: boolean;
  unpreparedStatement<T>(fn: () => Promise<T> | T): Promise<T> | T;
}

export function selectAll(
  this: SelectAllHost,
  super_: (...args: unknown[]) => unknown,
  ...args: unknown[]
): unknown {
  if (ExplainRegistry.isCollect() && this.preparedStatements) {
    return this.unpreparedStatement(() => super_(...args));
  } else {
    return super_(...args);
  }
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

  if (Array.isArray(flags)) {
    return flags.includes("MULTI_STATEMENTS");
  } else {
    return anybits(flags as number, MULTI_STATEMENTS);
  }
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
  this._databaseTimezone = defaultTimezone();

  const hasBinds = binds != null && binds.length > 0;

  if (prepare) this._trackPrepared?.(rawConnection, sql);

  const driverBinds = typeCastedBinds.map((value) =>
    value instanceof TimeWithZone ||
    value instanceof RubyTime ||
    value instanceof Temporal.PlainDate
      ? this.quotedDate(value)
      : value,
  );

  const readTimeout = this._config?.readTimeout;
  const timeoutOption = readTimeout != null ? { timeout: readTimeout * 1000 } : {};
  let rawResult: unknown;
  let rawFields: mysql.FieldPacket[] | undefined;
  let stmtToClose: { close(): void } | undefined;
  if (!hasBinds) {
    [rawResult, rawFields] = (await rawConnection.query({
      sql,
      rowsAsArray: true,
      ...timeoutOption,
    } as any)) as [unknown, mysql.FieldPacket[]];
  } else if (prepare) {
    try {
      [rawResult, rawFields] = (await rawConnection.execute(
        { sql, rowsAsArray: true, ...timeoutOption } as any,
        driverBinds as any[],
      )) as [unknown, mysql.FieldPacket[]];
    } catch (err) {
      this._statements?.delete(sql);
      throw err;
    }
  } else {
    const stmt = { sql, rowsAsArray: true, ...timeoutOption };
    try {
      [rawResult, rawFields] = (await rawConnection.execute(stmt as any, driverBinds as any[])) as [
        unknown,
        mysql.FieldPacket[],
      ];
      if (Array.isArray(rawResult)) {
        stmtToClose = { close: () => void rawConnection.unprepare(stmt as any) };
      } else {
        rawConnection.unprepare(stmt as any);
      }
    } catch (err) {
      rawConnection.unprepare(stmt as any);
      throw err;
    }
  }

  let result = rawResult as mysql.RowDataPacket[] | mysql.ResultSetHeader;
  let fields = rawFields;
  if (Array.isArray(rawFields) && Array.isArray(rawFields[0])) {
    result = (rawResult as unknown[])[0] as mysql.RowDataPacket[];
    fields = rawFields[0] as mysql.FieldPacket[];
  } else if (Array.isArray(rawFields) && rawFields[0] === undefined && Array.isArray(rawResult)) {
    result = (rawResult as unknown[])[0] as mysql.ResultSetHeader;
  }
  let rows: unknown[][] | null = null;
  let fieldList: string[] = [];
  let affectedRows = 0;
  let insertId: number | undefined;
  if (Array.isArray(result)) {
    rows = result as unknown[][];
    fieldList = (fields ?? []).map((field) => field.name);
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

  return {
    rows,
    fields: fieldList,
    toA: () => rows ?? [],
    affectedRows,
    insertId,
    _arStmtToClose: stmtToClose,
  };
}

/** @internal */
export function castResult(rawResult: Mysql2RawResult): Result {
  if (rawResult.rows == null) return Result.empty();

  const fields = rawResult.fields;

  let result: Result;
  if (fields.length === 0) {
    result = Result.empty();
  } else {
    result = new Result(fields, rawResult.toA());
  }

  freeRawResult(rawResult);

  return result;
}

/** @internal */
export function affectedRows(this: PerformQueryHost, rawResult: Mysql2RawResult): number {
  if (rawResult) freeRawResult(rawResult);
  return this._affectedRowsBeforeWarnings ?? 0;
}

/** @internal */
export function freeRawResult(rawResult: Mysql2RawResult): void {
  const stmt = rawResult._arStmtToClose;
  if (stmt) stmt.close();
}
