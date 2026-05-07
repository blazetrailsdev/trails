/**
 * Query assertions — test helpers for asserting SQL query behavior.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions
 */

import { Notifications, NotificationEvent } from "@blazetrails/activesupport";

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
  /** @internal */
  readonly logFull: [string, unknown[]][];

  readonly logAll: string[];

  constructor() {
    this.logFull = [];
    this.logAll = [];
  }

  get log(): string[] {
    return this.logFull.map(([sql]) => sql);
  }

  /** Notification handler — mirrors Rails' `call(*, payload)`. */
  call(_name: unknown, _id: unknown, payload: SqlPayload): void {
    if (payload.cached) return;

    const sql = payload.sql ?? "";
    this.logAll.push(sql);

    if (payload.name !== "SCHEMA") {
      const binds = (payload.binds as unknown[] | undefined) ?? [];
      this.logFull.push([sql, binds]);
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
  includeSchema: boolean,
  fn: () => void | Promise<void>,
): Promise<void> {
  const counter = new SQLCounter();
  const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
    counter.call(event.name, event.transactionId, event.payload as SqlPayload);
  });
  try {
    await fn();
  } finally {
    Notifications.unsubscribe(sub);
  }
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
}

/**
 * Asserts that no SQL queries are executed in the given block.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_no_queries
 */
export async function assertNoQueries(
  includeSchema: boolean,
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
  includeSchema: boolean,
  fn: () => void | Promise<void>,
): Promise<void> {
  const counter = new SQLCounter();
  const sub = Notifications.subscribe("sql.active_record", (event: NotificationEvent) => {
    counter.call(event.name, event.transactionId, event.payload as SqlPayload);
  });
  try {
    await fn();
  } finally {
    Notifications.unsubscribe(sub);
  }
  const queries = includeSchema ? counter.logAll : counter.log;
  const matched = queries.filter((q) => match.test(q));

  if (count !== undefined) {
    if (matched.length !== count) {
      throw new Error(
        `${matched.length} instead of ${count} queries were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
      );
    }
  } else {
    if (matched.length < 1) {
      throw new Error(
        `1 or more queries expected, but none were executed.${queries.length === 0 ? "" : `\nQueries:\n${queries.join("\n")}`}`,
      );
    }
  }
}

/**
 * Asserts that no SQL queries matching `match` are executed in the given block.
 *
 * Mirrors: ActiveRecord::Assertions::QueryAssertions#assert_no_queries_match
 */
export async function assertNoQueriesMatch(
  match: RegExp,
  includeSchema: boolean,
  fn: () => void | Promise<void>,
): Promise<void> {
  await assertQueriesMatch(match, 0, includeSchema, fn);
}
