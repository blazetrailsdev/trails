import { NotImplementedError } from "./errors.js";
import { ExplainRegistry } from "./explain-registry.js";
import type { Base } from "./base.js";
import type { ExplainOption } from "./adapter.js";

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
  // Delegate to Relation#_execExplain which handles typeCast, binary binds,
  // and adapter-specific buildExplainClause — reusing that logic avoids
  // duplicating the JSON.stringify / typeCast edge cases.
  return (modelClass as any).all()._execExplain(queries, options);
}

/** @internal */
function renderBind(connection: any, attr: any): never {
  throw new NotImplementedError("ActiveRecord::Explain#render_bind is not implemented");
}

/** @internal */
function buildExplainClause(connection: any, options?: any): never {
  throw new NotImplementedError("ActiveRecord::Explain#build_explain_clause is not implemented");
}
