/**
 * Global registry of query transformers applied to every SQL statement
 * before it is executed.
 *
 * Mirrors: ActiveRecord.query_transformers (active_record.rb) —
 * `singleton_class.attr_accessor :query_transformers` / `self.query_transformers = []`.
 * Rails iterates this list in `preprocess_query`:
 * `ActiveRecord.query_transformers.each { |t| sql = t.call(sql, self) }`.
 *
 * The list itself lives on the `ActiveRecord` module object in `ar-config.ts`,
 * alongside the other `singleton_class.attr_accessor` flags.
 *
 * A transformer is any object responding to `call(sql, connection)` and
 * returning the (possibly rewritten) SQL — `ActiveRecord::QueryLogs` is the
 * canonical one. The `connection` slot is opaque to the registry, hence
 * `unknown` rather than `any`.
 */

export interface QueryTransformer {
  call(sql: string, connection: unknown): string;
}
