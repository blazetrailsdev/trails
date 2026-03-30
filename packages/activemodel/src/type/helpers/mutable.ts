/**
 * Mutable helper — marks a type as mutable for in-place change detection.
 *
 * Mirrors: ActiveModel::Type::Helpers::Mutable
 *
 * Types that include Mutable report mutable?=true, meaning their
 * values can change in-place (e.g. arrays, hashes). changed_in_place?
 * always returns true for mutable types since we can't cheaply detect
 * in-place mutations.
 */
export interface Mutable {
  cast(value: unknown): unknown;
  changedInPlace(rawOldValue: unknown, newValue: unknown): boolean;
  isMutable(): boolean;
}

export const MutableMixin = {
  isMutable(): boolean {
    return true;
  },

  changedInPlace(_rawOldValue: unknown, _newValue: unknown): boolean {
    return true;
  },
};
