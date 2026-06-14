/**
 * Replace each `?` / `$N` placeholder in a compiled SQL string with the text
 * returned by `render(placeholder, index)`, where `index` is the placeholder's
 * left-to-right ordinal (matching the bind array order produced by
 * `ToSql#compileWithBinds`).
 *
 * This is the post-traversal bind-inlining step shared by `ToSql#compile` and
 * ActiveRecord's human-readable `toSql` paths. Centralizing the placeholder
 * regex here keeps the `?`/`$N` knowledge in the rendering layer rather than
 * re-deriving it at every call site (RFC-0022).
 */
export function substituteBoundValues(
  sql: string,
  render: (placeholder: string, index: number) => string,
): string {
  let i = 0;
  return sql.replace(/\?|\$\d+/g, (placeholder) => render(placeholder, i++));
}
