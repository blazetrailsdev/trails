import { sql as arelSql } from "@blazetrails/arel";
import { ArgumentError } from "@blazetrails/activemodel";
import { ActiveRecordError } from "../../errors.js";
import type { ExplainOption } from "../abstract/database-statements.js";
import type { Nodes } from "@blazetrails/arel";
import { Result } from "../../result.js";
import {
  defaultInsertValue as abstractDefaultInsertValue,
  internalExecQuery,
  toSql as abstractToSql,
} from "../abstract/database-statements.js";
import type { Version } from "../abstract-adapter.js";

export interface DatabaseStatements {
  execQuery(sql: string, name?: string | null, binds?: unknown[]): Promise<Result>;
  execDelete(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execUpdate(sql: string, name?: string | null, binds?: unknown[]): Promise<number>;
  execInsert(
    sql: string,
    name?: string | null,
    binds?: unknown[],
    pk?: string | false | null,
  ): Promise<unknown>;
  explain(arel: unknown, binds?: unknown[], options?: ExplainOption[]): Promise<string>;
  lastInsertedId(result: unknown): number;
  highPrecisionCurrentTimestamp(): Nodes.SqlLiteral;
}

const COMMENT_REGEX = String.raw`(?:--.*\n)|/\*(?:[^*]|\*[^/])*\*/`;
const READ_QUERY = new RegExp(
  `^(?:[(\\s]|${COMMENT_REGEX})*` +
    `(?:desc|describe|set|show|use|kill|begin|commit|explain|release|rollback|savepoint|select|with)`,
  "i",
);

export function isWriteQuery(sql: string): boolean {
  return !READ_QUERY.test(sql);
}

export interface BuildExplainClauseHost {
  isMariadb?(): Promise<boolean>;
  databaseVersion?: Version | Promise<Version>;
}

export async function buildExplainClause(
  this: BuildExplainClauseHost | void,
  options: ExplainOption[] = [],
): Promise<string> {
  if (options.length === 0) return "EXPLAIN";
  const clause = `EXPLAIN ${options
    .map((option) => (option.startsWith(":") ? option.slice(1) : option))
    .join(" ")
    .toUpperCase()}`;
  if ((await isAnalyzeWithoutExplain.call(this)) && clause.includes("ANALYZE")) {
    return clause.replace("EXPLAIN ", "");
  }
  return clause;
}

interface SupportsInsertReturningHost {
  /** @internal */
  supportsInsertReturning?(): Promise<boolean>;
}

interface AutoIncrementColumnHost {
  autoIncrement?: boolean;
}

/** @internal */
export async function isAnalyzeWithoutExplain(
  this: BuildExplainClauseHost | void,
): Promise<boolean> {
  const host = this as BuildExplainClauseHost | null;
  if (!(await host?.isMariadb?.())) return false;
  return ((await host?.databaseVersion)?.compare("10.1.0") ?? -1) >= 0;
}

/** @internal */
export function defaultInsertValue(column: AutoIncrementColumnHost): Nodes.SqlLiteral | undefined {
  if (column.autoIncrement) return undefined;
  return abstractDefaultInsertValue(column);
}

/**
 * @internal
 * @missingRailsCall first — PERMANENT
 */
export async function returningColumnValues(
  this: SupportsInsertReturningHost | void,
  result: Result,
): Promise<unknown[] | undefined> {
  if (await (this as SupportsInsertReturningHost | null)?.supportsInsertReturning?.()) {
    return result.rows[0] as unknown[] | undefined;
  }
  return undefined;
}

export interface MaxAllowedPacketHost {
  showVariable(name: string): Promise<string | null>;
  _maxAllowedPacket?: number | null;
  /** @internal */
  maxAllowedPacket(): Promise<number | null>;
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
  const maxPacket = await this.maxAllowedPacket();
  const currentSize = Buffer.byteLength(currentPacket, "utf8");
  if (maxPacket == null) throw new ArgumentError("comparison of Integer with nil failed");
  if (currentSize > maxPacket) {
    throw new ActiveRecordError(
      `Fixtures set is too large ${currentSize}. Consider increasing the max_allowed_packet variable.`,
    );
  }
  if (previousPacket === undefined) return true;
  return currentSize + Buffer.byteLength(previousPacket, "utf8") + 2 > maxPacket;
}

/** @internal */
export async function maxAllowedPacket(this: MaxAllowedPacketHost): Promise<number | null> {
  if (this._maxAllowedPacket != null) return this._maxAllowedPacket;
  const value = await this.showVariable("max_allowed_packet");
  return (this._maxAllowedPacket = value == null ? value : Number(value));
}

export function highPrecisionCurrentTimestamp(): Nodes.SqlLiteral {
  return arelSql("CURRENT_TIMESTAMP(6)");
}

export async function explain(
  this: BuildExplainClauseHost & {
    explainPrettyPrinter?(): { pp(result: Result, elapsed: number): string };
  },
  arel: unknown,
  binds: unknown[] = [],
  options: ExplainOption[] = [],
): Promise<string> {
  const sql =
    (await buildExplainClause.call(this, options)) +
    " " +
    abstractToSql.call(this as any, arel, binds);
  const start = Date.now();
  const result = await internalExecQuery.call(this as any, String(sql), "EXPLAIN", binds);
  const elapsed = (Date.now() - start) / 1000;
  return this.explainPrettyPrinter?.().pp(result, elapsed) ?? JSON.stringify(result.rows);
}
