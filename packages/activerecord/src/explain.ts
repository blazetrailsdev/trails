import { ExplainRegistry } from "./explain-registry.js";
import type { Base } from "./base.js";
import type { ExplainOption } from "./connection-adapters/abstract/database-statements.js";
import { Attribute } from "@blazetrails/activemodel";

/**
 * Explain module — entry points for collecting queries and running EXPLAIN.
 *
 * Mirrors: ActiveRecord::Explain
 */

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
 * Run EXPLAIN against each captured [sql, binds] pair and return a
 * formatted string ready to be logged.
 *
 * Delegates to the model's Relation for bind rendering so output is
 * consistent with Relation#explain — including typeCast and binary handling.
 *
 * Mirrors: ActiveRecord::Explain#exec_explain
 */
export async function execExplain(
  modelClass: typeof Base,
  queries: [string, unknown[]][],
  options: ExplainOption[] = [],
): Promise<string> {
  // Delegate to Relation#execExplain which handles typeCast, binary binds,
  // and adapter-specific buildExplainClause — reusing that logic avoids
  // duplicating the JSON.stringify / typeCast edge cases.
  return (modelClass as any).all().execExplain(queries, options);
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

/**
 * Render a single bind parameter as [name, value] for EXPLAIN output.
 * Binary values are replaced with a byte-count summary.
 *
 * Mirrors: ActiveRecord::Explain#render_bind (private)
 *
 * @internal
 */
export function renderBind(connection: any, attr: unknown): [string | null, unknown] {
  // Mirrors Rails: `if ActiveModel::Attribute === attr`
  if (attr instanceof Attribute) {
    const dbValue = attr.valueForDatabase;
    const isBinary = (attr.type as any)?.binary?.() ?? (attr.type as any)?.isBinary?.() ?? false;
    if (isBinary && (attr.value ?? dbValue) != null) {
      const bytes = byteSize(dbValue ?? attr.value);
      return [attr.name, `<${bytes} bytes of binary data>`];
    }
    return [attr.name, connection?.typeCast?.(dbValue) ?? dbValue];
  }
  const value = connection?.typeCast?.(attr) ?? attr;
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
 * `execExplain` is not a member here — it takes the receiving model class as
 * an explicit first argument on the class side, and `Relation` carries its own
 * `execExplain` mirror of explain.rb:19-36 already.
 *
 * Mirrors: ActiveRecord::Explain
 */
export const Explain = {
  collectingQueriesForExplain,
  renderBind,
} as const;
