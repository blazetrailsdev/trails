/** @noRailsEquivalent PERMANENT */
export interface ArelConnection {
  /** @internal */
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
  /** @internal */
  unquotedTrue(): boolean | number;
  /** @internal */
  unquotedFalse(): boolean | number;
  /** @internal */
  sanitizeAsSqlComment(value: string): string;
  /** @internal */
  castBoundValue(value: unknown): unknown;
}
