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
//
// Temporal types are emitted as inline `import(...)` expressions so
// the user's model file does not need to import from activesupport.
// This mirrors the pattern used for ActiveRecord types (AR_IMPORT in
// synthesize.ts).

const T = `import("@blazetrails/activesupport/temporal").Temporal`;

export const ATTRIBUTE_TYPE_MAP: Record<string, string> = {
  string: "string",
  text: "string",
  immutable_string: "string",
  uuid: "string",
  inet: "string",
  cidr: "string",
  citext: "string",
  integer: "number",
  big_integer: "bigint",
  float: "number",
  decimal: "number",
  boolean: "boolean",
  // date → PlainDate (no time component, no timezone).
  date: `${T}.PlainDate`,
  // datetime is the generic AR type; cast returns Instant when the stored
  // value has a UTC offset (timestamptz columns) or PlainDateTime when it
  // doesn't (naive timestamp columns). The union covers both cases.
  datetime: `${T}.Instant | ${T}.PlainDateTime`,
  // timestamp is the schema-dump key for naive (no-TZ) timestamp columns.
  timestamp: `${T}.PlainDateTime`,
  // timestamptz is the schema-dump key for timezone-aware columns.
  timestamptz: `${T}.Instant`,
  // time → PlainTime (no date, no timezone).
  time: `${T}.PlainTime`,
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
