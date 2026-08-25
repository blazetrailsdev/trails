/**
 * Ruby's `Array#uniq`, which the arel node equality tests lean on
 * (`assert_equal 1, array.uniq.size`).
 *
 * Ruby dedupes by `hash` + `eql?`; every arel node defines both
 * (`vendor/rails/activerecord/lib/arel/nodes/node.rb`), so this walks the
 * array with `eql` the way Ruby's hash-keyed dedupe does. It lives here rather
 * than in a test file for the same reason `must-be-like.ts` does — Rails gets
 * it from Ruby core, so no single test file owns it.
 *
 * @internal
 */
export function uniq<T>(array: readonly T[]): T[] {
  const result: T[] = [];
  for (const item of array) {
    if (!result.some((seen) => (seen as { eql(o: unknown): boolean }).eql(item))) result.push(item);
  }
  return result;
}
