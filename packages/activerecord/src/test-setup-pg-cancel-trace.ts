import { expect } from "vitest";
import { Temporal } from "@blazetrails/date";
import type { QueryCanceled } from "./errors.js";
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
  _rawConnection: { transactionStatus(): number } | null;
  _cancelAnyRunningQuery(...args: unknown[]): Promise<void>;
}

const TRACE_KEY = Symbol.for("activerecord.pg.cancelTrace");
const WRAPPED_KEY = Symbol.for("activerecord.pg.cancelTrace.wrapped");
const MAX_RECORDS = 50;

interface TraceState {
  records: CancelRecord[];
}

type TraceHost = { [TRACE_KEY]?: TraceState };

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

function installWorkerTrace(): TraceState {
  const host = process as unknown as TraceHost;
  const existing = host[TRACE_KEY];
  if (existing) return existing;
  const state: TraceState = { records: [] };
  host[TRACE_KEY] = state;
  process.on("unhandledRejection", (reason: unknown) => {
    if (!(reason instanceof Error) || reason.name !== "ActiveRecord::QueryCanceled") return;
    const { records } = state;
    console.error(
      [
        "[pg-cancel-trace] unhandled QueryCanceled",
        `  at: ${now()}`,
        `  surfaced during: ${JSON.stringify(currentTest())}`,
        `  sql: ${(reason as QueryCanceled).sql ?? "(none)"}`,
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
  });
  return state;
}

const state = installWorkerTrace();
const proto = PostgreSQLAdapter.prototype as unknown as TracedAdapter & { [WRAPPED_KEY]?: true };

if (!proto[WRAPPED_KEY]) {
  const original = proto._cancelAnyRunningQuery;
  proto[WRAPPED_KEY] = true;
  proto._cancelAnyRunningQuery = function (this: TracedAdapter, ...args: unknown[]) {
    state.records.push({
      at: now(),
      pid: this._client?.processID,
      transactionStatus:
        this._rawConnection == null ? "no raw connection" : this._rawConnection.transactionStatus(),
      ...currentTest(),
      stack: new Error("cancel issued").stack,
    });
    if (state.records.length > MAX_RECORDS) state.records.shift();
    return original.apply(this, args);
  };
}
