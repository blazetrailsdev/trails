import { IntegerType } from "@blazetrails/activemodel";

/**
 * Integer type that only allows unsigned (non-negative) values.
 *
 * Mirrors: ActiveRecord::Type::UnsignedInteger. Rails overrides
 * `min_value` to `0` and lets `Integer#ensure_in_range` raise
 * `ActiveModel::RangeError` when a negative slips through. In TS we
 * return `null` for the same outcome — values < 0 cannot round-trip as
 * unsigned, so cast rejects them outright (subclasses like PG's Oid
 * layer their own range check on top without worrying that the parent
 * silently clamps).
 */
export class UnsignedInteger extends IntegerType {
  override cast(value: unknown): number | null {
    const result = super.cast(value);
    if (result === null) return null;
    return result < 0 ? null : result;
  }

  // Keep serializability in sync with cast — negatives drop to null, so
  // they aren't serializable. Inherited IntegerType.isSerializable only
  // checks the signed range and would return true for small negatives.
  override isSerializable(value: unknown): boolean {
    return value == null || this.cast(value) !== null;
  }
}
