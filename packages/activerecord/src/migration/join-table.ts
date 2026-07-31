/**
 * JoinTable — helpers for deriving HABTM join table names.
 *
 * Mirrors: ActiveRecord::Migration::JoinTable
 */

/** @internal */
export function findJoinTableName(
  table1: string,
  table2: string,
  options: { tableName?: string } = {},
): string {
  return options.tableName ?? joinTableName(table1, table2);
}

/**
 * Rails' `join_table_name` delegates: `ModelSchema.derive_join_table_name(...)`
 * (join_table.rb:12). This port deliberately keeps its own copy of those three
 * lines instead, and that duplication is ratified rather than pending.
 *
 * This module must stay import-leaf. It is imported from deep inside the model
 * graph — `reflection.ts`, `associations.ts` and the abstract adapter's
 * `schema-statements.ts` — so adding the `model-schema.js` edge pulls that
 * module's transitive graph, including `connection-handling.js`, in ahead of
 * `base.ts`. The delegation was re-attempted and re-measured on 2026-07-31:
 * entering the graph through `SchemaStatements` then crashes at `base.ts`'s
 * top-level `extend(Base, ConnectionHandling.ClassMethods)` with
 * `TypeError: Cannot convert undefined or null to object`
 * (activesupport `include.ts:209`), because the `ConnectionHandling` namespace
 * is still mid-initialization. `scripts/test-deps/adapter-graph-import-tdz.test.ts`
 * is the only thing that catches it — typecheck, lint and every AR suite pass
 * while it is broken.
 *
 * The constraint is a property of `base.ts`'s eager module-level `extend()`
 * wiring, not of this file; until that wiring stops running at module-evaluation
 * time, nothing reaching the model graph can be imported here.
 * `model-schema.ts#deriveJoinTableName` remains the canonical definition, and
 * `join-table.test.ts` pins the two implementations to identical output so the
 * copy cannot drift.
 *
 * @internal
 */
export function joinTableName(table1: string, table2: string): string {
  const joined = [String(table1), String(table2)].sort().join("\0");
  const deduped = joined.replace(/^(.*[_.])(.+)\0\1(.+)/, "$1$2_$3");
  return deduped.replaceAll("\0", "_");
}
