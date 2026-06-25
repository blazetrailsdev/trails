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
 * (`queryTransformers.push(...)`, `queryTransformers.length = 0`) to register
 * or reset, exactly as Rails appends to and resets
 * `ActiveRecord.query_transformers`. Consumers import this live binding and
 * iterate it fresh on every query, so {@link setQueryTransformers} (a
 * wholesale reassignment, mirroring Rails' `query_transformers=`) is also
 * observed.
 */
export let queryTransformers: QueryTransformer[] = [];

/**
 * Replaces the transformer list wholesale. Mirrors
 * `ActiveRecord.query_transformers=` (active_record.rb:431).
 */
export function setQueryTransformers(value: QueryTransformer[]): void {
  queryTransformers = value;
}
