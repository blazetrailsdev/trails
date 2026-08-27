import { ExplainRegistry } from "./explain-registry.js";
import type { AbstractAdapter as DatabaseAdapter } from "./connection-adapters/abstract-adapter.js";
import type { ExplainOption } from "./connection-adapters/abstract/database-statements.js";
import { rubyInspect } from "./relation/ruby-inspect.js";
import { Attribute } from "@blazetrails/activemodel";
import { Temporal } from "@blazetrails/date";

/**
 * Explain module — entry points for collecting queries and running EXPLAIN.
 *
 * Mirrors: ActiveRecord::Explain
 */

/**
 * The receiver of every member below. Rails mixes `ActiveRecord::Explain` in on
 * both sides — `extend Explain` at base.rb:294 (class level) and
 * `include ... Explain ...` at relation.rb:68 (instance level) — so a model
 * class and a `Relation` run the same method objects. Both receivers answer
 * `with_connection`, which is all `exec_explain` needs.
 *
 * @internal
 */
export interface ExplainHost {
  withConnection<T>(fn: (conn: DatabaseAdapter) => T | Promise<T>): Promise<T>;
}

/**
 * Execute the block with query collection enabled. Queries are captured by
 * the subscriber and returned along with the block's result.
 *
 * Mirrors: ActiveRecord::Explain#collecting_queries_for_explain
 */
export async function collectingQueriesForExplain<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; queries: [string, unknown[]][] }> {
  return ExplainRegistry.collectingQueries(fn);
}

/**
 * Make the adapter execute EXPLAIN for the tuples of queries and bindings.
 * Returns a formatted string ready to be logged.
 *
 * Mirrors: ActiveRecord::Explain#exec_explain
 */
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
      // `explain` is required on the adapter in Rails (database_statements.rb:180-182
      // raises NotImplementedError) and the base body here does raise; the TS
      // interface member stays optional only because
      // `interface SchemaStatements extends DatabaseAdapter`
      // (abstract/schema-statements.ts:313) republishes every REQUIRED adapter
      // member as public surface of a file schema_statements.rb has no `explain`
      // in. Tracked by abstract-adapter-explain-required-not-implemented.
      msg += await c.explain!(sql, binds, options);
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

/**
 * Reduce a `type_cast`ed bind value to something `rubyInspect` renders as a
 * primitive. Ruby needs no such step — every `type_cast` result there already
 * has a meaningful `inspect` — but trails adapters hand back JS objects
 * (`Date`, `Temporal.*`, PG's `{ value, format }` binary wrapper) that would
 * otherwise print as `[object Object]`. Binary payloads take Rails'
 * `render_bind` binary form here rather than in the attribute branch, because
 * `ExplainRegistry` collects raw values with no `attr.type` to ask.
 */
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
  // Invalid (NaN) Date prints as "Invalid Date" instead of JSON's "null".
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? String(value) : value.toISOString();
  }
  // ZonedDateTime uses toInstant().toString() to avoid the bracketed IANA form.
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

/**
 * Render a single bind parameter as [name, value] for EXPLAIN output.
 * Binary values are replaced with a byte-count summary.
 *
 * Mirrors: ActiveRecord::Explain#render_bind (private)
 *
 * @internal
 */
export function renderBind(connection: any, attr: unknown): [string | null, unknown] {
  let value: unknown;
  // Mirrors Rails: `if ActiveModel::Attribute === attr`
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

/**
 * Build the EXPLAIN prefix clause. Delegates to the connection's
 * buildExplainClause method if available, otherwise returns "EXPLAIN for:".
 *
 * Mirrors: ActiveRecord::Explain#build_explain_clause (private)
 *
 * @internal
 */
export async function buildExplainClause(
  connection: any,
  options: ExplainOption[] = [],
): Promise<string> {
  if (connection && typeof connection.buildExplainClause === "function") {
    return connection.buildExplainClause(options);
  }
  return "EXPLAIN for:";
}

/**
 * The mixin itself. Rails mixes `ActiveRecord::Explain` in on both sides —
 * `extend Explain` at base.rb:294 (class level) and `include ... Explain ...`
 * at relation.rb:68 (instance level) — so both receivers resolve the same
 * method objects. `base.ts` wires the class side; `relation.ts` does
 * `include(Relation, Explain)` for the instance side. Neither redefines a
 * member: the definitions above are the single source for both.
 *
 * Mirrors: ActiveRecord::Explain
 */
export const Explain = {
  collectingQueriesForExplain,
  execExplain,
  renderBind,
  buildExplainClause,
} as const;
