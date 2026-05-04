import { IntegerType } from "@blazetrails/activemodel";

/**
 * Mirrors: ActiveRecord::Type::UnsignedInteger.
 *
 * Doubles the signed max and floors the min at 0 so that
 * serialize / serializeCastValue raise RangeError for out-of-range values
 * via the inherited ensureInRange hook (same as Rails).
 */
export class UnsignedInteger extends IntegerType {
  protected override maxValue(): number {
    return super.maxValue() * 2;
  }

  protected override minValue(): number {
    return 0;
  }
}
