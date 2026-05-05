/**
 * Query assertions — test helpers for asserting SQL query behavior.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions (testing/query_assertions.rb)
 */

import { Notifications, type NotificationEvent } from "@blazetrails/activesupport";

/**
 * Mirrors: ActiveRecord::Assertions::QueryAssertions::SQLCounter
 */
export class SQLCounter {
  logFull: Array<[string, unknown[]]> = [];
  logAll: string[] = [];

  constructor() {
    this.logFull = [];
    this.logAll = [];
  }

  get log(): string[] {
    return this.logFull.map(([sql]) => sql);
  }

  call(
    _name: string,
    _started: Date | null,
    _finished: Date | null,
    _id: string,
    payload: Record<string, unknown>,
  ): void {
    if (payload["cached"]) return;
    const sql = payload["sql"] as string;
    this.logAll.push(sql);
    if (payload["name"] !== "SCHEMA") {
      this.logFull.push([sql, (payload["binds"] as unknown[] | undefined) ?? []]);
    }
  }
}

function withSubscribed<T>(counter: SQLCounter, fn: () => T): T {
  const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
    counter.call(event.name, null!, null!, "", event.payload as Record<string, unknown>);
  });
  try {
    return fn();
  } finally {
    Notifications.unsubscribe(sub);
  }
}

/**
 * Asserts that `count` SQL queries (or ≥1 if count is null) are executed.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_queries_count
 */
export async function assertQueriesCount(
  count: number | null,
  optsOrFn: { includeSchema?: boolean } | (() => void | Promise<void>),
  fn?: () => void | Promise<void>,
): Promise<void> {
  const includeSchema = typeof optsOrFn !== "function" ? (optsOrFn.includeSchema ?? false) : false;
  const block = typeof optsOrFn === "function" ? optsOrFn : fn!;
  const counter = new SQLCounter();
  const result = withSubscribed(counter, block);
  if (result instanceof Promise) await result;
  const queries = includeSchema ? counter.logAll : counter.log;
  if (count !== null && count !== undefined) {
    if (queries.length !== count)
      throw new Error(
        `${queries.length} instead of ${count} queries were executed. Queries:\n${queries.join("\n\n")}`,
      );
  } else if (queries.length < 1) {
    throw new Error("1 or more queries expected, but none were executed.");
  }
}

/**
 * Asserts that no SQL queries are executed.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_no_queries
 */
export async function assertNoQueries(
  optsOrFn: { includeSchema?: boolean } | (() => void | Promise<void>),
  fn?: () => void | Promise<void>,
): Promise<void> {
  return typeof optsOrFn === "function"
    ? assertQueriesCount(0, optsOrFn)
    : assertQueriesCount(0, optsOrFn, fn!);
}

/**
 * Asserts that SQL queries matching `match` are executed (or ≥1 if count is null).
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_queries_match
 */
export async function assertQueriesMatch(
  match: RegExp | string,
  optsOrFn: { count?: number | null; includeSchema?: boolean } | (() => void | Promise<void>),
  fn?: () => void | Promise<void>,
): Promise<void> {
  const opts = typeof optsOrFn !== "function" ? optsOrFn : {};
  const block = typeof optsOrFn === "function" ? optsOrFn : fn!;
  const counter = new SQLCounter();
  const result = withSubscribed(counter, block);
  if (result instanceof Promise) await result;
  const queries = opts.includeSchema ? counter.logAll : counter.log;
  const re = match instanceof RegExp ? match : new RegExp(match);
  const matched = queries.filter((q) => re.test(q));
  const count = opts.count;
  if (count !== null && count !== undefined) {
    if (matched.length !== count)
      throw new Error(
        `${matched.length} instead of ${count} queries were executed.\nQueries:\n${queries.join("\n")}`,
      );
  } else if (matched.length < 1) {
    throw new Error(
      `1 or more queries expected, but none were executed.\nQueries:\n${queries.join("\n")}`,
    );
  }
}

/**
 * Asserts that no SQL queries matching `match` are executed.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_no_queries_match
 */
export async function assertNoQueriesMatch(
  match: RegExp | string,
  optsOrFn: { includeSchema?: boolean } | (() => void | Promise<void>),
  fn?: () => void | Promise<void>,
): Promise<void> {
  return typeof optsOrFn === "function"
    ? assertQueriesMatch(match, { count: 0 }, optsOrFn)
    : assertQueriesMatch(match, { count: 0, includeSchema: optsOrFn.includeSchema }, fn!);
}
