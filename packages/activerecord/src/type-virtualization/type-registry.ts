// Maps Rails attribute type strings to the TypeScript type the
// virtualizer writes into an injected `declare`.
//
// Two sources feed this map:
//
// 1. activemodel + activerecord runtime registries (see
//    packages/activemodel/src/type/registry.ts and
//    packages/activerecord/src/type.ts). Every key registered there
//    needs a matching entry here so the virtualizer can emit the right
//    declare for a user-declared `this.attribute(name, type)`.
//
// 2. Adapter schema dumps (schema-columns JSON passed via `--schema`).
//    PostgreSQL emits Rails type names from its column introspection.
//
// Some keys overlap (e.g. `text` is registered runtime-side by
// activerecord and also appears in PG dumps). Others are schema-dump-
// only (`timestamp`, `jsonb`, `hstore`, `inet`, `cidr`, `citext`) —
// activemodel/activerecord's runtime registry doesn't know them, so
// passing them to `this.attribute(...)` would throw. The virtualizer
// maps both kinds to TS types so the compile-time declare is correct
// for user-declared attributes AND schema-reflected columns.

export const ATTRIBUTE_TYPE_MAP: Record<string, string> = {
  string: "string",
  text: "string",
  immutable_string: "string",
  uuid: "string",
  inet: "string",
  cidr: "string",
  citext: "string",
  integer: "number",
  big_integer: "number",
  float: "number",
  decimal: "number",
  boolean: "boolean",
  date: "Date",
  datetime: "Date",
  timestamp: "Date",
  time: "Date",
  json: "unknown",
  jsonb: "unknown",
  // hstore values are nullable at runtime (see
  // connection-adapters/postgresql/oid/hstore.ts), so the compile-time
  // type allows null values too.
  hstore: "Record<string, string | null>",
  binary: "Uint8Array",
  array: "unknown[]",
  value: "unknown",
};

export function tsTypeFor(railsType: string): string {
  return ATTRIBUTE_TYPE_MAP[railsType] ?? "unknown";
}
