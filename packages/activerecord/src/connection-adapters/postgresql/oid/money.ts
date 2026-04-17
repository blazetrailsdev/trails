/**
 * PostgreSQL money type — currency amount.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Money.
 * Rails: `class Money < Type::Decimal`. Hard-codes scale to 2 and parses
 * locale-formatted money strings before delegating to Decimal#cast_value.
 */

import { DecimalType } from "@blazetrails/activemodel";

export class Money extends DecimalType {
  override readonly name: string = "money";

  /**
   * Narrow the constructor options: PG money has a hard-coded scale
   * of 2 (see the getter below), so accepting a caller-supplied scale
   * would be misleading. Precision and limit pass through to the
   * DecimalType base.
   */
  constructor(options?: { precision?: number; limit?: number }) {
    super(options);
  }

  override type(): string {
    return "money";
  }

  /**
   * Rails: `def scale; 2; end`. Getter override of Type's scale —
   * PG money always has 2 decimal places.
   */
  override get scale(): number {
    return 2;
  }

  /**
   * Rails' OID::Money#cast_value handles four locale-formatted shapes:
   *   (1) $12,345,678.12    (US-style)
   *   (2) $12.345.678,12    (EU-style with period grouping, comma decimal)
   *   (3) -$2.55            (negative with leading minus)
   *   (4) ($2.55)           (accounting-style parentheses)
   * This method performs the locale-specific stripping and normalization
   * itself, then delegates to DecimalType via super.cast(...) for
   * numeric casting.
   */
  override cast(value: unknown): string | null {
    return this.castValue(value);
  }

  /**
   * Rails' cast_value — exposed publicly so api:compare matches the
   * Rails method name and callers can invoke the hook directly.
   */
  castValue(value: unknown): string | null {
    if (typeof value !== "string") return super.cast(value);

    // (4) (2.55) → -2.55
    let str = value.replace(/^\((.+)\)$/, "-$1");

    if (/^-?\D*[\d,]+\.\d{2}$/.test(str)) {
      // (1) US format: keep digits/minus/dot, drop everything else.
      str = str.replace(/[^\-0-9.]/g, "");
    } else if (/^-?\D*[\d.]+,\d{2}$/.test(str)) {
      // (2) EU format: drop non-digit/minus/comma, then comma → dot.
      str = str.replace(/[^\-0-9,]/g, "").replace(/,/g, ".");
    }

    return super.cast(str);
  }
}
