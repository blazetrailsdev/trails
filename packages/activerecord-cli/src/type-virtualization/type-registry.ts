const T = `import("@blazetrails/date").Temporal`;
const IPADDR = `import("@blazetrails/ruby-compat").IPAddr`;
const TWZ = `import("@blazetrails/activesupport").TimeWithZone`;
const TIME = `import("@blazetrails/date").Time`;

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
  time: `${TWZ} | ${TIME}`,
  json: "unknown",
  jsonb: "unknown",
  hstore: "Record<string, string | null>",
  binary: "Uint8Array",
  array: "unknown[]",
  value: "unknown",
};

export function tsTypeFor(railsType: string, timeZoneAware?: boolean): string {
  if ((railsType === "datetime" || railsType === "time") && timeZoneAware !== undefined) {
    return timeZoneAware ? TWZ : TIME;
  }
  return ATTRIBUTE_TYPE_MAP[railsType] ?? "unknown";
}

export const ATTRIBUTE_CAST_INPUT_MAP: Record<string, string> = {
  string: "number | boolean",
  text: "number | boolean",
  immutable_string: "number | boolean",
  uuid: "",
  inet: "string",
  cidr: "string",
  citext: "number | boolean",
  integer: "string",
  big_integer: "number | string",
  float: "string",
  decimal: "string",
  boolean: "string | number",
  date: "string",
  datetime: "string",
  timestamp: "string",
  timestamptz: "string",
  time: "string",
  json: "",
  jsonb: "",
  hstore: "",
  binary: "string",
  array: "",
  value: "",
};

export function writerTsTypeFor(railsType: string, readerType: string): string {
  if (!Object.hasOwn(ATTRIBUTE_TYPE_MAP, railsType) || readerType === "unknown") return "unknown";
  const extra = ATTRIBUTE_CAST_INPUT_MAP[railsType];
  return extra ? `${readerType} | ${extra}` : readerType;
}
