/**
 * @noRailsEquivalent PERMANENT — Ruby's `@connection` is duck-typed: the visitor
 * just calls `quote` / `quote_table_name` / … on whatever it was handed, and no
 * Ruby file declares the shape. TypeScript has no such option, and `arel` cannot
 * name the class that supplies it (`ConnectionAdapters::Quoting` lives in
 * `activerecord`, which depends on `arel`, not the reverse), so a structural
 * interface is the only way to type the collaborator. Every member is the Rails
 * `Quoting` method of that name (`activerecord/lib/active_record/connection_adapters/abstract/quoting.rb`),
 * which is why this declares no surface of its own.
 */
export interface ArelConnection {
  /**
   * sqlite3/quoting.rb:48, mysql/quoting.rb:51, postgresql/quoting.rb:47,59
   * @internal
   */
  quoteTableName(name: unknown): string;
  /** @internal */
  quoteColumnName(name: unknown): string;
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
   * abstract/quoting.rb:94-107, mysql/quoting.rb:72-79, sqlite3/quoting.rb:87-97
   * @internal
   */
  unquotedTrue(): boolean | number;
  /** @internal */
  unquotedFalse(): boolean | number;
  /** @internal */
  sanitizeAsSqlComment(value: string): string;
  /** @internal */
  castBoundValue(value: unknown): unknown;
}
