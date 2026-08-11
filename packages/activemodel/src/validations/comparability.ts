/**
 * Comparability — helper for validators that compare values.
 *
 * Mirrors: ActiveModel::Validations::Comparability
 *
 * Included by ComparisonValidator and NumericalityValidator. Provides
 * COMPARE_CHECKS (each comparison option mapped to the Ruby comparison
 * operator the validator dispatches through) and error_options which
 * builds the i18n interpolation hash by stripping comparison keys from
 * the validator's options and merging in :count + :value.
 */

export const COMPARE_CHECKS = {
  greaterThan: ":>",
  greaterThanOrEqualTo: ":>=",
  equalTo: ":==",
  lessThan: ":<",
  lessThanOrEqualTo: ":<=",
  otherThan: ":!=",
} as const;

export function errorOptions(
  this: { options: Record<string, unknown> },
  value: unknown,
  optionValue: unknown,
): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  const compareKeys = Object.keys(COMPARE_CHECKS);
  for (const key of Object.keys(this.options)) {
    if (!compareKeys.includes(key)) {
      rest[key] = this.options[key];
    }
  }
  rest.count = optionValue;
  rest.value = value;
  return rest;
}

export type CompareKey = keyof typeof COMPARE_CHECKS;

export interface Comparability {
  errorOptions(value: unknown, optionValue: unknown): Record<string, unknown>;
}

/**
 * Applies a COMPARE_CHECKS operator to a `<=>` result.
 *
 * Rails dispatches the operator directly off the value —
 * `value.public_send(COMPARE_CHECKS[option], option_value)`
 * (comparison.rb:27, numericality.rb:60). TypeScript has neither
 * `public_send` nor operator methods, so the operator Symbol is applied
 * to the comparison result the caller computed.
 *
 * @noRailsEquivalent PERMANENT: TypeScript has no `public_send` and no operator
 * methods, so a Ruby comparison-operator Symbol cannot be dispatched off the value
 */
export function compareOperator(op: (typeof COMPARE_CHECKS)[CompareKey], cmp: number): boolean {
  switch (op) {
    case ":>":
      return cmp > 0;
    case ":>=":
      return cmp >= 0;
    case ":==":
      return cmp === 0;
    case ":<":
      return cmp < 0;
    case ":<=":
      return cmp <= 0;
    case ":!=":
      return cmp !== 0;
  }
}
