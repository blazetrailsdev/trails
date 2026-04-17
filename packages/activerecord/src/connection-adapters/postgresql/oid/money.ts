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

  override type(): string {
    return "money";
  }

  constructor(options?: { precision?: number; limit?: number }) {
    // Rails hard-codes `def scale; 2; end`. Pass scale=2 into the base
    // options so precision-aware helpers see the right value. The base
    // Type stores `scale` as a readonly field; in Ruby it's a method but
    // semantically both resolve the same way at the call site.
    super({ ...options, scale: 2 });
  }

  /**
   * Rails' OID::Money#cast_value handles four locale-formatted shapes:
   *   (1) $12,345,678.12    (US-style)
   *   (2) $12.345.678,12    (EU-style with period grouping, comma decimal)
   *   (3) -$2.55            (negative with leading minus)
   *   (4) ($2.55)           (accounting-style parentheses)
   * then delegates to super(value) which strips currency chars and casts.
   */
  override cast(value: unknown): string | null {
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
