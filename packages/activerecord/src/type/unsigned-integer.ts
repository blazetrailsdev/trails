import { IntegerType } from "@blazetrails/activemodel";

/**
 * Integer type that only allows unsigned (non-negative) values.
 * Values below 0 are clamped to 0.
 *
 * Mirrors: ActiveRecord::Type::UnsignedInteger
 */
export class UnsignedInteger extends IntegerType {
  override cast(value: unknown): number | null {
    const result = super.cast(value);
    if (result === null) return null;
    return result < 0 ? 0 : result;
  }
}
