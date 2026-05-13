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
}
