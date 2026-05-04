/**
 * Mutable helper — marks a type as mutable for in-place change detection.
 *
 * Mirrors: ActiveModel::Type::Helpers::Mutable
 */
import { type Included } from "@blazetrails/activesupport";
import { Type } from "../value.js";

/**
 * Mirrors: ActiveModel::Type::Helpers::Mutable (mutable.rb:1-23).
 *
 * Include into a type class via `include(MyType, MutableModule)`:
 * - `cast` round-trips through serialize/deserialize so the returned value
 *   is detached from the input reference (mutable.rb:7-9)
 * - `isChangedInPlace` compares serialized forms instead of always returning
 *   true (mutable.rb:14-16)
 * - `isMutable` returns true (mutable.rb:18-20)
 *
 * @internal Rails-private helper.
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

/** Structural type for types that include MutableModule. */
export type Mutable = Included<typeof MutableModule>;
