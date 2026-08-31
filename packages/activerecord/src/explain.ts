import { ExplainRegistry } from "./explain-registry.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ExplainOption } from "./connection-adapters/abstract/database-statements.js";
import { rubyInspect } from "./relation/ruby-inspect.js";
import { Attribute } from "@blazetrails/activemodel";
import { Temporal } from "@blazetrails/date";

/** @internal */
export interface ExplainHost {
  withConnection<T>(fn: (conn: DatabaseAdapter) => T | Promise<T>): Promise<T>;
}

export async function collectingQueriesForExplain<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; queries: [string, unknown[]][] }> {
  return ExplainRegistry.collectingQueries(fn);
}

export async function execExplain(
  this: ExplainHost,
  queries: [string, unknown[]][],
  options: ExplainOption[] = [],
): Promise<string> {
  const str = await this.withConnection(async (c) => {
    const msgs: string[] = [];
    for (const [sql, binds] of queries) {
      let msg = `${await buildExplainClause(c, options)} ${sql}`;
      if (binds.length > 0) {
        msg += " ";
        msg += rubyInspect(binds.map((attr) => renderBind(c, attr)));
      }
      msg += "\n";
      msg += await c.explain(sql, binds, options);
      msgs.push(msg);
    }
    return msgs.join("\n");
  });

  return str;
}

function byteSize(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") {
    return typeof Buffer !== "undefined"
      ? Buffer.byteLength(value)
      : new TextEncoder().encode(value).length;
  }
  if (typeof ArrayBuffer !== "undefined") {
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
  }
  return byteSize(String(value));
}

function binaryByteLength(value: unknown): number | null {
  if (typeof Buffer !== "undefined" && value instanceof Buffer) return value.byteLength;
  if (typeof ArrayBuffer !== "undefined") {
    if (value instanceof ArrayBuffer) return value.byteLength;
    if (ArrayBuffer.isView(value)) return value.byteLength;
  }
  return null;
}

function normalizeBindValue(value: unknown): unknown {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  // boundary: bound query inspect accepts caller-supplied values.
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  }
  if (value instanceof Temporal.ZonedDateTime) return value.toInstant().toString();
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime
  ) {
    return value.toString();
  }
  const bytes = binaryByteLength(value);
  if (bytes !== null) return `<${bytes} bytes of binary data>`;
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if ("value" in value && keys.length > 0 && keys.every((k) => k === "value" || k === "format")) {
      return normalizeBindValue((value as { value: unknown }).value);
    }
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

/** @internal */
export function renderBind(connection: any, attr: unknown): [string | null, unknown] {
  let value: unknown;
  if (attr instanceof Attribute) {
    const isBinary = (attr.type as any)?.binary?.() ?? (attr.type as any)?.isBinary?.() ?? false;
    if (isBinary && attr.value != null && attr.value !== false) {
      value = `<${byteSize(attr.valueForDatabase)} bytes of binary data>`;
    } else {
      value = normalizeBindValue(connection?.typeCast?.(attr.valueForDatabase));
    }
    return [attr.name, value];
  }
  value = normalizeBindValue(connection?.typeCast?.(attr) ?? attr);
  return [null, value];
}

/** @internal */
export async function buildExplainClause(
  connection: any,
  options: ExplainOption[] = [],
): Promise<string> {
  if (connection && typeof connection.buildExplainClause === "function") {
    return connection.buildExplainClause(options);
  }
  return "EXPLAIN for:";
}

export const Explain = {
  collectingQueriesForExplain,
  execExplain,
  renderBind,
  buildExplainClause,
} as const;
