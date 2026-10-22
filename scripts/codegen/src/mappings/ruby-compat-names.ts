/**
 * Spellings the lowering asks for that ruby-compat exports under its own
 * MRI-derived name (scripts/parity/ruby-compat.ts RUBY_COMPAT_EXPORTS).
 */
export const RUBY_COMPAT_RENAMES: Readonly<Record<string, string>> = {
  rbIvarGet: "rbObjIvarGet",
  rbIvarSet: "rbObjIvarSet",
  rbIvarDefined: "rbObjIvarDefined",
  rbInteger: "kernelInteger",
  rbFloat: "kernelFloat",
  rbFCatch: "kernelCatch",
  rbFThrow: "kernelThrow",
  rbToI: "toI",
  rbToA: "toA",
  rbToH: "toH",
  rbFormat: "format",
  jsDefineMethod: "rbModDefineMethod",
  encoding: "rbObjEncoding",
};

/** A Ruby operator method → its trails member name, where no conventions rule spells it. */
export const OPERATOR_TS_NAMES: Readonly<Record<string, string>> = {
  "==": "equals",
  "[]": "get",
  "[]=": "set",
  "<=>": "compareTo",
  "+": "plus",
  "-": "minus",
  "|": "union",
  "&": "intersect",
  "<<": "append",
  "===": "caseEq",
  "=~": "match",
  "!": "not",
  "!=": "notEquals",
  "*": "times",
  "/": "divide",
  "%": "modulo",
  "<": "lt",
  ">": "gt",
  "<=": "lte",
  ">=": "gte",
  "+@": "uplus",
  "-@": "negate",
  "!~": "notMatch",
  "~": "bitwiseNot",
  ">>": "rshift",
  "^": "xor",
  "**": "pow",
};
