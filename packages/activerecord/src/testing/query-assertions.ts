import { Notifications } from "@blazetrails/activesupport";

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

export async function assertNoQueries(
  includeSchema = false,
  fn: () => void | Promise<void>,
): Promise<void> {
  await assertQueriesCount(0, includeSchema, fn);
}

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

export async function assertNoQueriesMatch(
  match: RegExp,
  includeSchema = false,
  fn: () => void | Promise<void>,
): Promise<void> {
  await assertQueriesMatch(match, 0, includeSchema, fn);
}
