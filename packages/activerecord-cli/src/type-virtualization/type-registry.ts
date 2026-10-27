const T = `import("@blazetrails/date").Temporal`;
const IPADDR = `import("@blazetrails/ruby-compat").IPAddr`;
const TWZ = `import("@blazetrails/activesupport").TimeWithZone`;
const TIME = `import("@blazetrails/ruby-compat").Time`;

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
  datetime: `${TWZ} | ${TIME}`,
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

export function tsTypeFor(railsType: string, timeZoneAware?: boolean): string {
  if (railsType === "datetime" && timeZoneAware !== undefined) {
    return timeZoneAware ? TWZ : TIME;
  }
  return ATTRIBUTE_TYPE_MAP[railsType] ?? "unknown";
}
