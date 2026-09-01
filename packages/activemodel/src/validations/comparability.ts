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

/** @noRailsEquivalent PERMANENT */
export function compareOperator(
  op: (typeof COMPARE_CHECKS)[CompareKey],
  a: number | bigint,
  b: number | bigint,
): boolean {
  switch (op) {
    case ":>":
      return a > b;
    case ":>=":
      return a >= b;
    case ":==":
      return a == b;
    case ":<":
      return a < b;
    case ":<=":
      return a <= b;
    case ":!=":
      return a != b;
  }
}
