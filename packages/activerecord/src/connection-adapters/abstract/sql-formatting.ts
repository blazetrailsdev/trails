/**
 * Dialect-agnostic SQL formatting helpers — datetime serialization and
 * the column-name regexes used by `disallow_raw_sql!`.
 *
 * These are NOT part of the {@link Quoting} interface (Rails keeps the
 * column-name matchers in `Quoting::ClassMethods` because they don't
 * depend on instance state, and the datetime formatters live in
 * `ActiveSupport::TimeWithZone` / `Type::DateTime#serialize`). They live
 * here so non-adapter call sites (`relation.ts`, `query-methods.ts`)
 * can reach them without importing `abstract/quoting.ts` — keeping the
 * "no abstract/quoting imports outside the adapter layer" rule clean.
 *
 * @internal
 */
export {
  columnNameMatcher,
  columnNameWithOrderMatcher,
  defaultSqlTimezone,
  formatInstantForSql,
} from "./quoting.js";
