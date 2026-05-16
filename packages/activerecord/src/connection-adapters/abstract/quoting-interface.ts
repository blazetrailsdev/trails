/**
 * Quoting interface — the contract every connection adapter satisfies
 * for value/identifier quoting.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::Quoting (mixed into
 * AbstractAdapter; PG/MySQL/SQLite override what differs).
 *
 * Call sites depend on this interface — never on the standalone
 * functions in `abstract/quoting.ts` — so dialect dispatch happens via
 * the active adapter rather than a string-enum parameter.
 *
 * @internal
 */
export interface Quoting {
  /** Mirrors: Quoting#quote — SQL-literal form of a value. */
  quote(value: unknown): string;

  /**
   * Mirrors: Quoting#quote_string — **escape-only**. Doubles `'` and
   * applies any dialect-specific escape rules (MySQL `\\\0\n\r\Z`; PG
   * may switch to `E'…'` form for backslashes inside `quote()`). Never
   * adds surrounding `'`. For a fully-quoted SQL literal use
   * `quote(value)` instead.
   *
   * Note: per-adapter standalone `quoteString` exports in
   * `{sqlite3,mysql}/quoting.ts` historically wrap with surrounding
   * `'...'` and are NOT escape-only. Adapter classes override
   * `quoteString` to honor this contract; the standalones stay as
   * literal-quoting helpers for legacy call sites.
   */
  quoteString(s: string): string;

  /** Mirrors: Quoting#quote_column_name (identifier-form). PG/SQLite double-quote, MySQL backtick. */
  quoteIdentifier(name: string): string;

  /** Mirrors: Quoting#quote_table_name (handles schema-qualified names). */
  quoteTableName(name: string): string;

  /** Mirrors: Quoting#quote_column_name. */
  quoteColumnName(name: string): string;

  /** Mirrors: Quoting#quote_table_name_for_assignment (`UPDATE ... SET col = ...`). */
  quoteTableNameForAssignment(table: string, attr: string): string;

  /** Mirrors: Quoting#quote_default_expression (DDL DEFAULT clause). */
  quoteDefaultExpression(value: unknown, column?: unknown): string;

  /** Mirrors: Quoting#quoted_true. Abstract/PG/MySQL: `"TRUE"`; SQLite: `"1"`. */
  quotedTrue(): string;

  /** Mirrors: Quoting#quoted_false. */
  quotedFalse(): string;

  /** Mirrors: Quoting#unquoted_true. PG: `true`; MySQL/SQLite: `1`. */
  unquotedTrue(): boolean | number;

  /** Mirrors: Quoting#unquoted_false. */
  unquotedFalse(): boolean | number;

  /** Mirrors: Quoting#quoted_binary — adapter-specific binary literal. */
  quotedBinary(value: unknown): string;

  /** Mirrors: Quoting#type_cast — primitive form for bind params. */
  typeCast(value: unknown): unknown;

  /** Mirrors: Quoting#cast_bound_value — bound-param coercion. */
  castBoundValue(value: unknown): unknown;

  /** Mirrors: Quoting#sanitize_as_sql_comment — strip comment-close sequences from comment text. */
  sanitizeAsSqlComment(value: unknown): string;
}

// `column_name_matcher` / `column_name_with_order_matcher` are deliberately
// NOT on this interface. In Rails they live in `Quoting::ClassMethods`
// (active_record/connection_adapters/abstract/quoting.rb:18, :33) — the
// regexes don't depend on instance state, so they're class methods.
// Trails mirrors that with `static columnNameMatcher()` on each concrete
// adapter (e.g. SQLite3Adapter:97). Call sites resolve them via
// `adapter.constructor.columnNameMatcher()` (relation.ts:211,
// query-methods.ts:155).
