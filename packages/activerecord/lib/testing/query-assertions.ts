import "../constants.testing-query-assertions.generated.js";
import { Notifications } from "@blazetrails/activesupport";
import { _assertNothingRaisedOrWarn, assert } from "@blazetrails/activesupport/testing/assertions";
import { rbEqq } from "@blazetrails/ruby-compat";
import { Base } from "../base.js";

/** @internal */
export interface SqlPayload {
  sql?: string;
  name?: string;
  binds?: unknown[];
  cached?: boolean;
  [key: string]: unknown;
}

export class SQLCounter {
  readonly logFull: [string, unknown[]][];

  readonly logAll: string[];

  constructor() {
    this.logFull = [];
    this.logAll = [];
  }

  get log(): string[] {
    return this.logFull.map(([sql]) => sql);
  }

  call(...args: unknown[]): void {
    const payload = args[args.length - 1] as SqlPayload;
    if (payload.cached) return;

    const sql = payload.sql ?? "";
    this.logAll.push(sql);

    if (payload.name !== "SCHEMA") {
      const boundValues = (payload.binds ?? []).map((value: unknown) =>
        value != null && "valueForDatabase" in Object(value)
          ? (value as { valueForDatabase: unknown }).valueForDatabase
          : value,
      );

      this.logFull.push([sql, boundValues]);
    }
  }
}

type Block<T> = () => T | Promise<T>;

export async function assertQueriesCount<T>(block: Block<T>): Promise<T>;
export async function assertQueriesCount<T>(
  count: number | null | undefined,
  block: Block<T>,
): Promise<T>;
export async function assertQueriesCount<T>(
  count: number | null | undefined,
  options: { includeSchema?: boolean },
  block: Block<T>,
): Promise<T>;
export async function assertQueriesCount<T>(
  count: number | null | undefined | Block<T> = null,
  options: { includeSchema?: boolean } | Block<T> = {},
  block?: Block<T>,
): Promise<T> {
  if (typeof count === "function") [count, options, block] = [null, {}, count];
  if (typeof options === "function") [options, block] = [{}, options];
  const { includeSchema = false } = options;
  await (await Base.leaseConnection()).materializeTransactions();

  const counter = new SQLCounter();
  return await Notifications.subscribed(counter, "sql.active_record", async () => {
    const result = (await _assertNothingRaisedOrWarn("assert_queries_count", block)) as T;
    const queries = includeSchema ? counter.logAll : counter.log;
    if (count != null) {
      assert(
        queries.length === count,
        `${queries.length} instead of ${count} queries were executed. Queries: ${queries.join("\n\n")}`,
      );
    } else {
      assert(
        queries.length >= 1,
        `1 or more queries expected, but none were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
      );
    }
    return result;
  });
}

export async function assertNoQueries<T>(block: Block<T>): Promise<T>;
export async function assertNoQueries<T>(
  options: { includeSchema?: boolean },
  block: Block<T>,
): Promise<T>;
export async function assertNoQueries<T>(
  options: { includeSchema?: boolean } | Block<T> = {},
  block?: Block<T>,
): Promise<T> {
  if (typeof options === "function") [options, block] = [{}, options];
  const { includeSchema = false } = options;
  return await assertQueriesCount(0, { includeSchema }, block!);
}

export async function assertQueriesMatch<T>(match: RegExp | string, block: Block<T>): Promise<T>;
export async function assertQueriesMatch<T>(
  match: RegExp | string,
  options: { count?: number | null; includeSchema?: boolean },
  block: Block<T>,
): Promise<T>;
export async function assertQueriesMatch<T>(
  match: RegExp | string,
  options: { count?: number | null; includeSchema?: boolean } | Block<T> = {},
  block?: Block<T>,
): Promise<T> {
  if (typeof options === "function") [options, block] = [{}, options];
  const { count = null, includeSchema = false } = options;
  await (await Base.leaseConnection()).materializeTransactions();

  const counter = new SQLCounter();
  return await Notifications.subscribed(counter, "sql.active_record", async () => {
    const result = (await _assertNothingRaisedOrWarn("assert_queries_match", block)) as T;
    const queries = includeSchema ? counter.logAll : counter.log;
    const matchedQueries = queries.filter((query) => rbEqq(match, query));

    if (count != null) {
      assert(
        matchedQueries.length === count,
        `${matchedQueries.length} instead of ${count} queries were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
      );
    } else {
      assert(
        matchedQueries.length >= 1,
        `1 or more queries expected, but none were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
      );
    }

    return result;
  });
}

export async function assertNoQueriesMatch<T>(match: RegExp | string, block: Block<T>): Promise<T>;
export async function assertNoQueriesMatch<T>(
  match: RegExp | string,
  options: { includeSchema?: boolean },
  block: Block<T>,
): Promise<T>;
export async function assertNoQueriesMatch<T>(
  match: RegExp | string,
  options: { includeSchema?: boolean } | Block<T> = {},
  block?: Block<T>,
): Promise<T> {
  if (typeof options === "function") [options, block] = [{}, options];
  const { includeSchema = false } = options;
  return await assertQueriesMatch(match, { count: 0, includeSchema }, block!);
}

export const QueryAssertions = {
  assertQueriesCount,
  assertNoQueries,
  assertQueriesMatch,
  assertNoQueriesMatch,
};
