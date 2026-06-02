/**
 * Global registry of query transformers applied to every SQL statement
 * before it is executed.
 *
 * Mirrors: ActiveRecord.query_transformers (active_record.rb) —
 * `singleton_class.attr_accessor :query_transformers` / `self.query_transformers = []`.
 * Rails iterates this list in `preprocess_query`:
 * `ActiveRecord.query_transformers.each { |t| sql = t.call(sql, self) }`.
 *
 * A transformer is any object responding to `call(sql, connection)` and
 * returning the (possibly rewritten) SQL — `ActiveRecord::QueryLogs` is the
 * canonical one. The `connection` slot is opaque to the registry, hence
 * `unknown` rather than `any`.
 */

export interface QueryTransformer {
  call(sql: string, connection: unknown): string;
}

/**
 * The mutable, process-global transformer list. Mutate in place
 * (`queryTransformers.push(...)`, `queryTransformers.length = 0`) — ESM live
 * bindings are read-only for importers, so the array identity is stable and
 * callers register/reset by mutating its contents, exactly as Rails appends to
 * and resets `ActiveRecord.query_transformers`.
 */
export const queryTransformers: QueryTransformer[] = [];
