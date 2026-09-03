/** @noRailsEquivalent CONVERGEABLE move-ruby-inspect-and-compact-uniq-to-ruby-compat */
import { Nodes } from "@blazetrails/arel";

export function rubyInspect(value: unknown): string {
  if (value === null || value === undefined) return "nil";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "bigint") return String(value);
  if (typeof value === "string") {
    /* eslint-disable no-control-regex */
    return `"${value
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\r/g, "\\r")
      .replace(/\t/g, "\\t")
      .replace(/\f/g, "\\f")
      .replace(/\x08/g, "\\b")
      .replace(/\v/g, "\\v")
      .replace(/\0/g, "\\0")
      .replace(/\x07/g, "\\a")
      .replace(/\x1b/g, "\\e")}"`;
    /* eslint-enable no-control-regex */
  }
  if (Array.isArray(value)) return rubyInspectArray(value);
  if (isPlainObject(value)) return rubyInspectHash(value);
  return String(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

export function rubyInspectHash(value: object): string {
  const pairs = Object.entries(value).map(([key, val]) => `${key}: ${rubyInspect(val)}`);
  return `{${pairs.join(", ")}}`;
}

export function rubyInspectArray(values: unknown[]): string {
  return `[${values.map(rubyInspect).join(", ")}]`;
}

export function inspectArelValue(value: unknown): string {
  if (value instanceof Nodes.SqlLiteral) return `sql(${JSON.stringify(value.value)})`;
  if (value instanceof Nodes.Node) return `sql(${JSON.stringify(value.toSql())})`;
  if (typeof value === "string" && value.startsWith(":")) return value;
  return JSON.stringify(value);
}

export function inspectOrderClause(clause: unknown): string {
  if (Array.isArray(clause)) {
    const [col, dir] = clause as [string, "asc" | "desc"];
    return JSON.stringify(`${col} ${dir}`);
  }
  return inspectArelValue(clause);
}
