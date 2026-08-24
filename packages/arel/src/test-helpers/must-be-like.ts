/**
 * Minitest's `must_be_like`: compare SQL with runs of whitespace collapsed.
 *
 * Mirrors Rails' `Minitest::Expectation#must_be_like`
 * (`vendor/rails/activerecord/test/cases/arel/helper.rb:10-13`), which squeezes
 * `\s+` to a single space and strips before deferring to `must_equal`. It is a
 * string normalizer, not an assertion wrapper, so the call site keeps a native
 * `expect(...).toBe(...)`.
 *
 * @internal
 */
export function mustBeLike(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}
