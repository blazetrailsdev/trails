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
