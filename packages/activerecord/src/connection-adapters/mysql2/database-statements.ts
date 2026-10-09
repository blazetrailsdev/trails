import { Result } from "../../result.js";
import { combineMultiStatements, type MaxAllowedPacketHost } from "../mysql/database-statements.js";
import { lastInsertedId as abstractLastInsertedId } from "../abstract/database-statements.js";
import { anybits, rbObjIvarGet, rbObjIvarSet } from "@blazetrails/ruby-compat";
import type { StatementPool } from "../statement-pool.js";
import {
  Mysql2,
  type Mysql2Client,
  type Mysql2Result,
  type Mysql2Statement,
} from "./mysql2-client.js";
import { defaultTimezone } from "../../active-record.js";
import { ExplainRegistry } from "../../explain-registry.js";

export interface DatabaseStatementsHost {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  preparedStatements?: boolean;
}

/** @internal */
interface PerformQueryHost {
  _affectedRowsBeforeWarnings: number | null;
  _statements: StatementPool<Mysql2Statement>;
  isMultiStatementsEnabled(): boolean;
  active(): Promise<boolean>;
  handleWarnings(sql: string): Promise<void>;
  verifiedBang(): void;
}

/** @internal */
interface LastInsertedIdHost {
  _rawConnection: Mysql2Client | null;
  supportsInsertReturning(): Promise<boolean>;
}

/** @internal */
interface MultiStatementsHost {
  _config?: { flags?: string[] | number };
}

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
  return this._rawConnection?.lastId;
}

/** @internal */
export function isMultiStatementsEnabled(this: MultiStatementsHost): boolean {
  const flags = this._config?.flags;

  if (Array.isArray(flags)) {
    return flags.includes("MULTI_STATEMENTS");
  } else {
    return anybits(flags as number, Mysql2.Client.MULTI_STATEMENTS);
  }
}

/** @internal */
export async function performQuery(
  this: PerformQueryHost,
  rawConnection: Mysql2Client,
  sql: string,
  binds: unknown[] | null,
  typeCastedBinds: unknown[],
  {
    prepare,
    notificationPayload,
    batch = false,
  }: {
    prepare: boolean;
    notificationPayload: Record<string, unknown>;
    batch?: boolean;
  },
): Promise<Mysql2Result | null> {
  let resetMultiStatement: true | undefined;
  try {
    if (batch && !this.isMultiStatementsEnabled()) {
      await rawConnection.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_ON);
      resetMultiStatement = true;
    }

    rawConnection.queryOptions.databaseTimezone = defaultTimezone();

    let result: Mysql2Result | null = null;
    if (binds == null || binds.length === 0) {
      result = await rawConnection.query(sql);
      this._affectedRowsBeforeWarnings = result?.size ?? rawConnection.affectedRows;
    } else if (prepare) {
      const stmt =
        this._statements.get(sql) ?? this._statements.set(sql, rawConnection.prepare(sql));
      try {
        result = await stmt.execute(...typeCastedBinds);
        this._affectedRowsBeforeWarnings = stmt.affectedRows;
      } catch (e) {
        this._statements.delete(sql);
        throw e;
      }
    } else {
      const stmt = rawConnection.prepare(sql);

      try {
        result = await stmt.execute(...typeCastedBinds);
        this._affectedRowsBeforeWarnings = stmt.affectedRows;

        if (result != null) {
          rbObjIvarSet(result, "@_ar_stmt_to_close", stmt);
        } else {
          stmt.close();
        }
      } catch (e) {
        stmt.close();
        throw e;
      }
    }

    notificationPayload["affected_rows"] = this._affectedRowsBeforeWarnings;
    notificationPayload["row_count"] = result?.size ?? 0;

    rawConnection.abandonResultsBang();

    this.verifiedBang();
    await this.handleWarnings(sql);
    return result;
  } finally {
    if (resetMultiStatement && (await this.active())) {
      await rawConnection.setServerOption(Mysql2.Client.OPTION_MULTI_STATEMENTS_OFF);
    }
  }
}

/** @internal */
export function castResult(rawResult: Mysql2Result | null): Result {
  if (rawResult == null) return Result.empty();

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
export function affectedRows(
  this: { _affectedRowsBeforeWarnings: number | null },
  rawResult: Mysql2Result | null,
): number {
  if (rawResult != null) freeRawResult(rawResult);

  return this._affectedRowsBeforeWarnings ?? 0;
}

/** @internal */
export function freeRawResult(rawResult: Mysql2Result): void {
  rawResult.free();
  const stmt = rbObjIvarGet(rawResult, "@_ar_stmt_to_close") as Mysql2Statement | null;
  if (stmt != null) stmt.close();
}
