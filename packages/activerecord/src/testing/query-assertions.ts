/**
 * Query assertions — test helpers for asserting SQL query behavior.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions
 */

import { Notifications } from "@blazetrails/activesupport";

/** @internal */
export interface SqlPayload {
  sql?: string;
  name?: string;
  binds?: unknown[];
  cached?: boolean;
  [key: string]: unknown;
}

/**
 * Mirrors: ActiveRecord::Assertions::QueryAssertions::SQLCounter
 *
 * Collects SQL queries by subscribing to `sql.active_record` notifications.
 * `logFull` contains non-schema [sql, binds] pairs; `logAll` contains all sql strings.
 */
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

  /**
   * Mirrors Ruby's `def call(*, payload)` — the payload is the last positional,
   * whatever arity the notifier's subscriber hands it.
   */
  call(...args: unknown[]): void {
    const payload = args[args.length - 1] as SqlPayload;
    if (payload.cached) return;

    const sql = payload.sql ?? "";
    this.logAll.push(sql);

    if (payload.name !== "SCHEMA") {
      // `value.value_for_database if value.respond_to?(:value_for_database)`
      // (query_assertions.rb:111). trails' QueryAttribute spells it as a
      // getter, so the respond_to? test is a property check.
      const boundValues = (payload.binds ?? []).map((value: unknown) =>
        value != null && "valueForDatabase" in Object(value)
          ? (value as { valueForDatabase: unknown }).valueForDatabase
          : value,
      );

      this.logFull.push([sql, boundValues]);
    }
  }
}

/**
 * Asserts that the number of SQL queries executed in the given block matches
 * the expected count. If `count` is omitted, asserts at least one query ran.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_queries_count
 */
export async function assertQueriesCount(
  count: number | undefined,
  includeSchema = false,
  fn: () => void | Promise<void>,
): Promise<void> {
  const counter = new SQLCounter();
  await Notifications.subscribed(counter, "sql.active_record", async () => {
    await fn();
    const queries = includeSchema ? counter.logAll : counter.log;
    if (count !== undefined) {
      if (queries.length !== count) {
        throw new Error(
          `${queries.length} instead of ${count} queries were executed. Queries: ${queries.join("\n\n")}`,
        );
      }
    } else {
      if (queries.length < 1) {
        throw new Error("1 or more queries expected, but none were executed.");
      }
    }
  });
}

/**
 * Asserts that no SQL queries are executed in the given block.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_no_queries
 */
export async function assertNoQueries(
  includeSchema = false,
  fn: () => void | Promise<void>,
): Promise<void> {
  await assertQueriesCount(0, includeSchema, fn);
}

/**
 * Asserts that SQL queries matching `match` executed in the given block meet
 * the expected count. If `count` is omitted, asserts at least one match.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_queries_match
 */
export async function assertQueriesMatch(
  match: RegExp,
  count: number | undefined,
  includeSchema = false,
  fn: () => void | Promise<void>,
): Promise<void> {
  const counter = new SQLCounter();
  await Notifications.subscribed(counter, "sql.active_record", async () => {
    await fn();
    const queries = includeSchema ? counter.logAll : counter.log;
    // Reset lastIndex before each test (and after) to mirror Ruby Regexp#=== (always stateless).
    const matchedQueries = queries.filter((query) => {
      match.lastIndex = 0;
      return match.test(query);
    });
    match.lastIndex = 0;

    if (count !== undefined) {
      if (matchedQueries.length !== count) {
        throw new Error(
          `${matchedQueries.length} instead of ${count} queries were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
        );
      }
    } else {
      if (matchedQueries.length < 1) {
        throw new Error(
          `1 or more queries expected, but none were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
        );
      }
    }
  });
}

/**
 * Asserts that no SQL queries matching `match` are executed in the given block.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_no_queries_match
 */
export async function assertNoQueriesMatch(
  match: RegExp,
  includeSchema = false,
  fn: () => void | Promise<void>,
): Promise<void> {
  await assertQueriesMatch(match, 0, includeSchema, fn);
}
