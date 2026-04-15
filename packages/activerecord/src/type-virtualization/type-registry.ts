// Maps Rails attribute type strings (as passed to `this.attribute(name, type)`)
// to the TypeScript type the virtualizer writes into an injected `declare`.
//
// Keys must stay in sync with activemodel's TypeRegistry
// (packages/activemodel/src/type/registry.ts); any new runtime type
// registered there needs a matching entry here.

export const ATTRIBUTE_TYPE_MAP: Record<string, string> = {
  string: "string",
  immutable_string: "string",
  uuid: "string",
  integer: "number",
  big_integer: "number",
  float: "number",
  decimal: "number",
  boolean: "boolean",
  date: "Date",
  datetime: "Date",
  time: "Date",
  json: "unknown",
  binary: "Uint8Array",
  array: "unknown[]",
  value: "unknown",
};

export function tsTypeFor(railsType: string): string {
  return ATTRIBUTE_TYPE_MAP[railsType] ?? "unknown";
}
