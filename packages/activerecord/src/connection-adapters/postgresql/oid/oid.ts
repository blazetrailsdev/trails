/**
 * PostgreSQL OID type — object identifier.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Oid.
 * Rails: `class Oid < Type::UnsignedInteger`.
 */

import { UnsignedInteger } from "../../../type/unsigned-integer.js";

const PG_OID_MAX = 0xffffffff;

export class Oid extends UnsignedInteger {
  override readonly name: string = "oid";

  // Rails' `class Oid < Type::UnsignedInteger` sets no :limit, so the
  // introspected column reports `limit == nil` and `t.oid` dumps bare. We
  // must not pass a limit either: UnsignedInteger already doubles the
  // default-limit-4 signed max (2^31) to 2^32, giving exactly the unsigned-32
  // OID window [0, 0xffffffff] — no expanded limit is needed for range
  // coverage. Carrying limit=8 surfaced a spurious `limit: 8` on oid columns.

  override type(): string {
    return "oid";
  }

  override cast(value: unknown): number | null {
    const cast = super.cast(value);
    // Rails' UnsignedInteger rejects negatives; PG OIDs are unsigned 32-bit.
    if (cast == null) return cast;
    if (cast < 0 || cast > PG_OID_MAX) return null;
    return cast;
  }

  override serialize(value: unknown): unknown {
    return this.cast(value);
  }

  /**
   * cast clamps to the unsigned-32 window (returning null for negatives or
   * values past 0xffffffff); mirror that here so isSerializable agrees with
   * what serialize will actually emit.
   */
  override isSerializable(value: unknown): boolean {
    if (value == null) return true;
    return this.cast(value) != null;
  }
}
