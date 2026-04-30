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

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric::NUMERIC_REGEX
 * (numeric.rb).
 */
const NUMERIC_REGEX = /^\s*[+-]?\d/;

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric#non_numeric_string?
 * (numeric.rb):
 *
 *   def non_numeric_string?(value)
 *     !NUMERIC_REGEX.match?(value)
 *   end
 *
 * Used to decide whether a string would round-trip through `to_i`/`to_d`
 * to a meaningful number — Rails treats "wibble" → 0 as a no-op when
 * comparing dirty state, so this predicate filters those out.
 *
 * @internal Rails-private helper.
 */
export function isNonNumericString(value: unknown): boolean {
  return !NUMERIC_REGEX.test(String(value));
}

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric#number_to_non_number?
 * (numeric.rb):
 *
 *   def number_to_non_number?(old_value, new_value_before_type_cast)
 *     old_value != nil && !new_value_before_type_cast.is_a?(::Numeric) &&
 *       non_numeric_string?(new_value_before_type_cast.to_s)
 *   end
 *
 * @internal Rails-private helper.
 */
export function isNumberToNonNumber(oldValue: unknown, newValueBeforeTypeCast: unknown): boolean {
  if (oldValue === null || oldValue === undefined) return false;
  if (typeof newValueBeforeTypeCast === "number" || typeof newValueBeforeTypeCast === "bigint") {
    return false;
  }
  return isNonNumericString(newValueBeforeTypeCast);
}

/**
 * Mirrors: ActiveModel::Type::Helpers::Numeric#equal_nan?
 * (numeric.rb):
 *
 *   def equal_nan?(old_value, new_value)
 *     (old_value.is_a?(::Float) || old_value.is_a?(BigDecimal)) &&
 *       old_value.nan? &&
 *       old_value.instance_of?(new_value.class) &&
 *       new_value.nan?
 *   end
 *
 * Trails has no BigDecimal class, so the constructor-equality check
 * collapses to "both are JS numbers and both are NaN".
 *
 * @internal Rails-private helper.
 */
export function isEqualNan(oldValue: unknown, newValue: unknown): boolean {
  return (
    typeof oldValue === "number" &&
    Number.isNaN(oldValue) &&
    typeof newValue === "number" &&
    Number.isNaN(newValue)
  );
}
