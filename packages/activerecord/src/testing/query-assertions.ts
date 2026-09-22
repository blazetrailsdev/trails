import { Notifications, assert } from "@blazetrails/activesupport";

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

export async function assertQueriesCount<T>(
  count: number | undefined,
  includeSchema = false,
  fn: () => T | Promise<T>,
): Promise<T> {
  const counter = new SQLCounter();
  return await Notifications.subscribed(counter, "sql.active_record", async () => {
    const result = await fn();
    const queries = includeSchema ? counter.logAll : counter.log;
    if (count !== undefined) {
      assert(
        queries.length === count,
        `${queries.length} instead of ${count} queries were executed. Queries: ${queries.join("\n\n")}`,
      );
    } else {
      assert(queries.length >= 1, "1 or more queries expected, but none were executed.");
    }
    return result;
  });
}

export async function assertNoQueries<T>(
  includeSchema = false,
  fn: () => T | Promise<T>,
): Promise<T> {
  return await assertQueriesCount(0, includeSchema, fn);
}

export async function assertQueriesMatch<T>(
  match: RegExp | string,
  count: number | undefined,
  includeSchema = false,
  fn: () => T | Promise<T>,
): Promise<T> {
  const counter = new SQLCounter();
  return await Notifications.subscribed(counter, "sql.active_record", async () => {
    const result = await fn();
    const queries = includeSchema ? counter.logAll : counter.log;
    const matchedQueries = queries.filter((query) => {
      if (typeof match === "string") return match === query;
      match.lastIndex = 0;
      return match.test(query);
    });
    if (typeof match !== "string") match.lastIndex = 0;

    if (count !== undefined) {
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

export async function assertNoQueriesMatch<T>(
  match: RegExp | string,
  includeSchema = false,
  fn: () => T | Promise<T>,
): Promise<T> {
  return await assertQueriesMatch(match, 0, includeSchema, fn);
}
