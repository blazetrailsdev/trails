import { type Included } from "@blazetrails/activesupport";
import { Type } from "../value.js";

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export const MutableModule = {
  cast(this: Type, value: unknown): unknown {
    return this.deserialize(this.serialize(value));
  },

  isChangedInPlace(this: Type, rawOldValue: unknown, newValue: unknown): boolean {
    return rawOldValue !== this.serialize(newValue);
  },

  isMutable(this: Type): boolean {
    return true;
  },
};

export type Mutable = Included<typeof MutableModule>;
