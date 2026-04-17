/**
 * PostgreSQL decimal/numeric type.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Decimal.
 * Rails: `class Decimal < Type::Decimal`. Adds only `infinity(options)`
 * returning `BigDecimal("Infinity")` (or negative) for range bound
 * sanitisation.
 */

import { DecimalType } from "@blazetrails/activemodel";

export class Decimal extends DecimalType {
  /**
   * Mirrors Rails' Decimal#infinity(options = {}).
   * BigDecimal isn't a primitive in JS, so we return ±Infinity — the
   * callsite (OID::Range) treats both as "unbounded".
   */
  infinity(options: { negative?: boolean } = {}): number {
    return options.negative ? -Infinity : Infinity;
  }
}
