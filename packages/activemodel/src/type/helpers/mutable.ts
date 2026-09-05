import { type Included } from "@blazetrails/activesupport";
import { ValueType } from "../value.js";

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export const MutableModule = {
  cast(this: ValueType, value: unknown): unknown {
    return this.deserialize(this.serialize(value));
  },

  isChangedInPlace(this: ValueType, rawOldValue: unknown, newValue: unknown): boolean {
    return rawOldValue !== this.serialize(newValue);
  },

  isMutable(this: ValueType): boolean {
    return true;
  },
};

export type Mutable = Included<typeof MutableModule>;
