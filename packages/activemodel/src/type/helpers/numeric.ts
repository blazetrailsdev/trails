/**
 * Numeric helper — shared behavior for numeric type casting.
 *
 * Mirrors: ActiveModel::Type::Helpers::Numeric
 *
 * Provides common casting logic: blank strings cast to null,
 * non-numeric strings raise errors, and changed? uses numeric comparison.
 */
export interface Numeric {
  serialize(value: unknown): number | null;
  serializeCastValue(value: unknown): number | null;
  cast(value: unknown): number | null;
  changed(oldValue: unknown, newValue: unknown, rawNewValue: unknown): boolean;
}

export const NumericMixin = {
  castNumeric(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") return value;
    if (typeof value === "boolean") return value ? 1 : 0;
    const str = String(value).trim();
    if (str === "") return null;
    const num = Number(str);
    if (isNaN(num)) {
      throw new Error(`"${str}" is not a valid number`);
    }
    return num;
  },

  numericChanged(oldValue: unknown, newValue: unknown, _rawNewValue: unknown): boolean {
    const oldNum = NumericMixin.castNumeric(oldValue);
    const newNum = NumericMixin.castNumeric(newValue);
    return oldNum !== newNum;
  },
};
