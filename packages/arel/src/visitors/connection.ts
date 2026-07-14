/**
 * Connection-quoting surface exposed to the Arel visitor.
 *
 * Mirrors Rails' `@connection` object passed to `Arel::Visitors::ToSql`.
 * Rails dispatches every quoting decision through the connection so adapters
 * can specialise (PG hex-escapes binary, MySQL backtick-quotes identifiers,
 * etc.).  We accept this subset so `arel` stays dependency-free from
 * `activerecord`; `AbstractAdapter` is a structural superset and always
 * satisfies this interface.
 */
export interface ArelConnection {
  /** @internal */
  quoteTableName(name: string): string;
  /** @internal */
  quoteColumnName(name: string): string;
  /** @internal */
  quoteString(s: string): string;
  /** @internal */
  quote(value: unknown): string;
  /** @internal */
  quotedBinary(value: unknown): string;
  /** @internal */
  quotedTrue(): string;
  /** @internal */
  quotedFalse(): string;
  /**
   * The bare (un-quoted) boolean literals. Rails' `type_cast` uses this pair —
   * not `quoted_true`/`quoted_false` — for booleans (`abstract/quoting.rb:94-107`),
   * and PostgreSQL's `encode_array` routes every array element through
   * `type_cast_array` -> `type_cast`. MySQL and SQLite both override the pair to
   * `1`/`0` (`mysql/quoting.rb:72-79`, `sqlite3/quoting.rb:87-97`), so array
   * elements must dispatch through the connection to reach the right literal.
   * @internal
   */
  unquotedTrue(): boolean | number;
  /** @internal */
  unquotedFalse(): boolean | number;
  /**
   * Sanitize a string for inclusion inside a SQL comment (optimizer hints,
   * query annotations). Mirrors Rails' `@connection.sanitize_as_sql_comment`,
   * which the Arel visitor delegates to so each adapter applies its own
   * comment-escaping rules.
   * @internal
   */
  sanitizeAsSqlComment(value: string): string;
  /**
   * Cast a value to be used as a bound parameter of unknown type. Mirrors
   * Rails' `@connection.cast_bound_value`, which `visit_Arel_Nodes_BoundSqlLiteral`
   * applies to every non-Arel scalar before `collector.add_bind`. The abstract
   * adapter returns the value unchanged; MySQL stringifies numerics/booleans.
   * @internal
   */
  castBoundValue(value: unknown): unknown;
}
