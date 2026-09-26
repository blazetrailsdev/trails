import { camelize } from "@blazetrails/activesupport";

const OPERATOR_SPELLINGS: Readonly<Record<string, string>> = {
  "+": "plus",
  "-": "difference",
  "|": "union",
  "&": "intersection",
  "[]": "at",
  to_ary: "toArray",
};

export function tsName(method: string): string {
  if (OPERATOR_SPELLINGS[method]) return OPERATOR_SPELLINGS[method];
  return method.endsWith("?") ? `is${camelize(method.slice(0, -1))}` : camelize(method, false);
}
