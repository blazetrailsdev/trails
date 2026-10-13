import { sql as arelSql } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";
import { aryJoin, b, cmp, first, rbCmpint } from "@blazetrails/ruby-compat";
import { ActiveRecordError } from "../../errors.js";
import type { ExplainOption } from "../abstract/database-statements.js";
import type { Nodes } from "@blazetrails/arel";
import { Result } from "../../result.js";
import { ExplainPrettyPrinter } from "./explain-pretty-printer.js";
import {
  defaultInsertValue as abstractDefaultInsertValue,
  returningColumnValues as abstractReturningColumnValues,
  type DatabaseStatementsHost,
} from "../abstract/database-statements.js";
import { AbstractAdapter, type Version } from "../abstract-adapter.js";

const READ_QUERY = AbstractAdapter.buildReadQueryRegexp(
  "desc",
  "describe",
  "set",
  "show",
  "use",
  "kill",
);

export function isWriteQuery(sql: string | null): boolean {
  try {
    return !READ_QUERY.test(sql as string);
  } catch (error) {
    if (!(error instanceof ArgumentError)) throw error;
    return !READ_QUERY.test(b(sql as string));
  }
}

export interface BuildExplainClauseHost {
  isMariadb(): Promise<boolean>;
  databaseVersion: Version | Promise<Version>;
}

export function highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
  return arelSql("CURRENT_TIMESTAMP(6)");
}

interface SupportsInsertReturningHost {
  /** @internal */
  supportsInsertReturning(): Promise<boolean>;
}

interface AutoIncrementColumnHost {
  isAutoIncrement?(): boolean;
}

export async function explain(
  this: {
    buildExplainClause(options?: ExplainOption[]): Promise<string>;
    toSql(arel: unknown, binds?: unknown[]): string;
    internalExecQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  },
  arel: unknown,
  binds: unknown[] = [],
  options: ExplainOption[] = [],
): Promise<string> {
  const sql = (await this.buildExplainClause(options)) + " " + this.toSql(arel, binds);
  const start = Date.now();
  const result = await this.internalExecQuery(sql, "EXPLAIN", binds);
  const elapsed = (Date.now() - start) / 1000;
  return new ExplainPrettyPrinter().pp(result, elapsed);
}

export async function buildExplainClause(
  this: BuildExplainClauseHost,
  options: ExplainOption[] = [],
): Promise<string> {
  if (options.length === 0) return "EXPLAIN";

  const explainClause = `EXPLAIN ${aryJoin(options, " ").toUpperCase()}`;

  if ((await isAnalyzeWithoutExplain.call(this)) && explainClause.includes("ANALYZE")) {
    return explainClause.replace("EXPLAIN ", "");
  } else {
    return explainClause;
  }
}

/** @internal */
export async function isAnalyzeWithoutExplain(this: BuildExplainClauseHost): Promise<boolean> {
  return (await this.isMariadb()) && (await this.databaseVersion).compare("10.1.0") >= 0;
}

export interface MaxAllowedPacketHost {
  showVariable(name: string): Promise<unknown>;
  _maxAllowedPacket?: number | null;
  /** @internal */
  maxAllowedPacket(): Promise<number | null>;
}

/** @internal */
export function defaultInsertValue(column: AutoIncrementColumnHost): Nodes.SqlLiteral | null {
  if (column.isAutoIncrement?.()) return null;
  return abstractDefaultInsertValue(column);
}

/** @internal */
export async function returningColumnValues(
  this: SupportsInsertReturningHost,
  result: Result,
): Promise<unknown[] | undefined> {
  if (await this.supportsInsertReturning()) {
    return first(result.rows);
  } else {
    return abstractReturningColumnValues.call(
      this as SupportsInsertReturningHost & DatabaseStatementsHost,
      result,
    );
  }
}

/** @internal */
export async function combineMultiStatements(
  this: MaxAllowedPacketHost,
  totalSql: string[],
): Promise<string[]> {
  const chunks: string[] = [];
  for (const sql of totalSql) {
    const previousPacket = chunks[chunks.length - 1];
    if (await isMaxAllowedPacketReached.call(this, sql, previousPacket)) {
      chunks.push(sql);
    } else {
      chunks[chunks.length - 1] = `${previousPacket};\n${sql}`;
    }
  }
  return chunks;
}

/** @internal */
export async function isMaxAllowedPacketReached(
  this: MaxAllowedPacketHost,
  currentPacket: string,
  previousPacket: string | undefined,
): Promise<boolean> {
  const bytesize = Buffer.byteLength(currentPacket, "utf8");
  const maxPacket = await this.maxAllowedPacket();
  if (rbCmpint(cmp(bytesize, maxPacket), bytesize, maxPacket) > 0) {
    throw new ActiveRecordError(
      `Fixtures set is too large ${bytesize}. Consider increasing the max_allowed_packet variable.`,
    );
  } else if (previousPacket == null) {
    return true;
  } else {
    const combined = bytesize + Buffer.byteLength(previousPacket, "utf8") + 2;
    return rbCmpint(cmp(combined, maxPacket), combined, maxPacket) > 0;
  }
}

/** @internal */
export async function maxAllowedPacket(this: MaxAllowedPacketHost): Promise<number | null> {
  return (this._maxAllowedPacket ??= (await this.showVariable("max_allowed_packet")) as
    | number
    | null);
}
