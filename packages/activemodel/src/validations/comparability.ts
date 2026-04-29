/**
 * Comparability — helper for validators that compare values.
 *
 * Mirrors: ActiveModel::Validations::Comparability
 *
 * Included by ComparisonValidator and NumericalityValidator. Provides
 * COMPARE_CHECKS (the comparison option keys) and error_options which
 * builds the i18n interpolation hash by stripping comparison keys from
 * the validator's options and merging in :count + :value.
 */

export const COMPARE_CHECKS = [
  "greaterThan",
  "greaterThanOrEqualTo",
  "equalTo",
  "lessThan",
  "lessThanOrEqualTo",
  "otherThan",
] as const;

export interface Comparability {
  errorOptions(value: unknown, optionValue: unknown): Record<string, unknown>;
}

export function errorOptions(
  this: { options: Record<string, unknown> },
  value: unknown,
  optionValue: unknown,
): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const key of Object.keys(this.options)) {
    if (!(COMPARE_CHECKS as readonly string[]).includes(key)) {
      rest[key] = this.options[key];
    }
  }
  rest.count = optionValue;
  rest.value = value;
  return rest;
}
