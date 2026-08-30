const T = `import("@blazetrails/date").Temporal`;
const IPADDR = `import("@blazetrails/activerecord").IPAddr`;
const TWZ = `import("@blazetrails/activesupport").TimeWithZone`;

export const ATTRIBUTE_TYPE_MAP: Record<string, string> = {
  string: "string",
  text: "string",
  immutable_string: "string",
  uuid: "string",
  inet: IPADDR,
  cidr: IPADDR,
  citext: "string",
  integer: "number",
  big_integer: "bigint",
  float: "number",
  decimal: "number",
  boolean: "boolean",
  date: `${T}.PlainDate`,
  datetime: `${T}.Instant | ${T}.PlainDateTime`,
  timestamp: `${T}.PlainDateTime`,
  timestamptz: `${T}.Instant`,
  time: `${T}.Instant | ${TWZ}`,
  json: "unknown",
  jsonb: "unknown",
  hstore: "Record<string, string | null>",
  binary: "Uint8Array",
  array: "unknown[]",
  value: "unknown",
};

export function tsTypeFor(railsType: string): string {
  return ATTRIBUTE_TYPE_MAP[railsType] ?? "unknown";
}
