/**
 * PostgreSQL OID type — object identifier.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Oid.
 * Rails: `class Oid < Type::UnsignedInteger`. We don't yet have an
 * UnsignedIntegerType in activemodel, so extend IntegerType and add a
 * signed-range rejection in cast to approximate unsigned semantics.
 */

import { IntegerType } from "@blazetrails/activemodel";

const PG_OID_MAX = 0xffffffff;

export class Oid extends IntegerType {
  override readonly name: string = "oid";

  constructor(options?: { limit?: number }) {
    // PG OIDs are unsigned 32-bit. IntegerType's default signed range
    // (limit=4 → max 2^31-1) rejects half the valid OID space at
    // serialize time. Use limit=8 so the base range check permits the
    // full unsigned-32 window; we clamp to it explicitly below.
    super({ limit: options?.limit ?? 8 });
  }

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
   * IntegerType.isSerializable only checks the signed range for the
   * expanded limit=8 — it'd green-light negatives and values past
   * 0xffffffff, which cast would then turn into null. Gate both on
   * the unsigned-32 window.
   */
  override isSerializable(value: unknown): boolean {
    if (value == null) return true;
    return this.cast(value) != null;
  }
}
