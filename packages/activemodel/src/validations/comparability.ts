/**
 * Comparability — helper for validators that compare values.
 *
 * Mirrors: ActiveModel::Validations::Comparability
 *
 * In Rails, Comparability is included by ComparisonValidator and
 * NumericalityValidator. It provides error_options which builds
 * the error message interpolation hash with the comparison target.
 */
import { resolveValue } from "./resolve-value.js";

export interface Comparability {
  errorOptions(optionValue: unknown, record: unknown, value?: unknown): Record<string, unknown>;
}

export function errorOptions(
  optionValue: unknown,
  record: unknown,
  value?: unknown,
): Record<string, unknown> {
  return { count: resolveValue(record, optionValue), value };
}
