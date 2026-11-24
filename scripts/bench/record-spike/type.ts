export type ColumnType = "integer" | "string" | "datetime" | "value";

export function lookupCastType(sqlType: string): ColumnType {
  if (/int/i.test(sqlType)) return "integer";
  if (/char|text|clob/i.test(sqlType)) return "string";
  if (/datetime|timestamp/i.test(sqlType)) return "datetime";
  return "value";
}

function castInteger(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.trunc(value) : null;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "string") {
    const n = Number.parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

const HAS_ZONE = /(?:Z|[+-]\d\d(?::?\d\d)?)$/;

function castDatetime(value: unknown): Temporal.Instant | null {
  if (value instanceof Temporal.Instant) return value;
  if (typeof value === "string") {
    if (value === "") return null;
    const iso = value.replace(" ", "T");
    return Temporal.Instant.from(HAS_ZONE.test(iso) ? iso : `${iso}Z`);
  }
  if (value instanceof Date) return Temporal.Instant.fromEpochMilliseconds(value.getTime());
  return null;
}

export function cast(type: ColumnType, value: unknown): unknown {
  if (value == null) return null;
  switch (type) {
    case "integer":
      return castInteger(value);
    case "string":
      return typeof value === "string" ? value : String(value);
    case "datetime":
      return castDatetime(value);
    default:
      return value;
  }
}

export function serialize(type: ColumnType, value: unknown): unknown {
  if (type !== "datetime" || !(value instanceof Temporal.Instant)) return value;
  return value.toString().replace("T", " ").slice(0, -1);
}

export function isEqual(a: unknown, b: unknown): boolean {
  if (a instanceof Temporal.Instant && b instanceof Temporal.Instant) return a.equals(b);
  return a === b;
}
