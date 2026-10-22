/**
 * Ruby core classes and the ruby-compat class objects that stand for them where
 * a Ruby body compares classes (`argument.class == String` is
 * `rbObjClass(argument) === rbCString`).
 */
export const RB_CORE_CLASSES: Readonly<Record<string, string>> = {
  String: "rbCString",
  Integer: "rbCInteger",
  Float: "rbCFloat",
  Numeric: "rbCNumeric",
  Array: "rbCArray",
  Symbol: "rbCSymbol",
  NilClass: "rbCNilClass",
  TrueClass: "rbCTrueClass",
  FalseClass: "rbCFalseClass",
};
