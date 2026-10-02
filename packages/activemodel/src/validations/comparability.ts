import { except, mergeBang } from "@blazetrails/ruby-compat";

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
  return mergeBang(except(this.options, ...Object.keys(COMPARE_CHECKS)), {
    count: optionValue,
    value: value,
  });
}

export type CompareKey = keyof typeof COMPARE_CHECKS;

export interface Comparability {
  errorOptions(value: unknown, optionValue: unknown): Record<string, unknown>;
}
