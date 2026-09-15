import { expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import { QueryCanceled } from "./errors.js";
import { PostgreSQLAdapter } from "./connection-adapters/postgresql-adapter.js";

interface CancelRecord {
  at: string;
  pid: number | null | undefined;
  transactionStatus: unknown;
  test: string | undefined;
  file: string | undefined;
  stack: string | undefined;
}

interface TracedAdapter {
  _client: { processID?: number | null } | null;
  _rawConnection: unknown;
  transactionStatus: unknown;
  _cancelAnyRunningQuery(...args: unknown[]): Promise<void>;
}

type TraceGlobal = { [HANDLER_KEY]?: (reason: unknown) => void };

const HANDLER_KEY = Symbol.for("activerecord.pg.cancelTrace");
const MAX_RECORDS = 50;

function now(): string {
  return Temporal.Now.instant().toString();
}

function currentTest(): { test: string | undefined; file: string | undefined } {
  try {
    const state = expect.getState();
    return { test: state.currentTestName, file: state.testPath };
  } catch {
    return { test: undefined, file: undefined };
  }
}

const traceGlobal = globalThis as TraceGlobal;

if (!traceGlobal[HANDLER_KEY]) {
  const records: CancelRecord[] = [];
  const proto = PostgreSQLAdapter.prototype as unknown as TracedAdapter;
  const original = proto._cancelAnyRunningQuery;

  proto._cancelAnyRunningQuery = function (this: TracedAdapter, ...args: unknown[]) {
    records.push({
      at: now(),
      pid: this._client?.processID,
      transactionStatus: this._rawConnection == null ? "no raw connection" : this.transactionStatus,
      ...currentTest(),
      stack: new Error("cancel issued").stack,
    });
    if (records.length > MAX_RECORDS) records.shift();
    return original.apply(this, args);
  };

  const handler = (reason: unknown) => {
    if (!(reason instanceof QueryCanceled)) return;
    console.error(
      [
        "[pg-cancel-trace] unhandled QueryCanceled",
        `  at: ${now()}`,
        `  surfaced during: ${JSON.stringify(currentTest())}`,
        `  sql: ${reason.sql ?? "(none)"}`,
        `  adapter cancels recorded in this worker (${records.length}, oldest first):`,
        ...records.map((r) =>
          [
            `  - at ${r.at} pid=${r.pid} transactionStatus=${String(r.transactionStatus)} file=${r.file} test=${JSON.stringify(r.test)}`,
            ...(r.stack ?? "")
              .split("\n")
              .slice(1, 12)
              .map((l) => `      ${l.trim()}`),
          ].join("\n"),
        ),
        records.length === 0
          ? "  (no adapter cancel in this worker: suspect a server-side pg_cancel_backend or another worker)"
          : "",
      ].join("\n"),
    );
  };

  traceGlobal[HANDLER_KEY] = handler;
  process.on("unhandledRejection", handler);
}
