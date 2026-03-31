/**
 * PostgreSQL array type — casts between PG array literals and JS arrays.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Array
 */

export class Array {
  readonly subtype: { cast(value: unknown): unknown; serialize(value: unknown): unknown };
  readonly delimiter: string;

  constructor(
    subtype: { cast(value: unknown): unknown; serialize(value: unknown): unknown },
    delimiter: string = ",",
  ) {
    this.subtype = subtype;
    this.delimiter = delimiter;
  }

  get type(): string {
    return "array";
  }

  cast(value: unknown): unknown[] | null {
    if (value == null) return null;
    if (globalThis.Array.isArray(value)) return value.map((v) => this.subtype.cast(v));
    if (typeof value === "string") return this.parseArray(value);
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (!globalThis.Array.isArray(value)) return null;
    const items = value.map((v) => {
      const s = this.subtype.serialize(v);
      if (s == null) return "NULL";
      const str = String(s);
      if (
        str === "" ||
        str.toUpperCase() === "NULL" ||
        str.includes(this.delimiter) ||
        str.includes('"') ||
        str.includes("\\") ||
        str.includes("{") ||
        str.includes("}") ||
        /\s/.test(str)
      ) {
        return `"${str.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
      }
      return str;
    });
    return `{${items.join(this.delimiter)}}`;
  }

  deserialize(value: unknown): unknown[] | null {
    if (value == null) return null;
    if (globalThis.Array.isArray(value)) return value.map((v) => this.subtype.cast(v));
    if (typeof value === "string") return this.parseArray(value);
    return null;
  }

  private parseArray(str: string): unknown[] {
    const trimmed = str.trim();
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return [];
    const inner = trimmed.slice(1, -1);
    if (inner === "") return [];

    const elements: unknown[] = [];
    let i = 0;

    while (i < inner.length) {
      if (inner[i] === '"') {
        i++;
        let val = "";
        while (i < inner.length && inner[i] !== '"') {
          if (inner[i] === "\\" && i + 1 < inner.length) {
            i++;
            val += inner[i];
          } else {
            val += inner[i];
          }
          i++;
        }
        i++; // closing quote
        elements.push(this.subtype.cast(val));
      } else if (
        inner.substring(i, i + 4).toUpperCase() === "NULL" &&
        (i + 4 >= inner.length || inner[i + 4] === this.delimiter || inner[i + 4] === "}")
      ) {
        elements.push(null);
        i += 4;
      } else if (inner[i] === "{") {
        let depth = 1;
        const start = i;
        i++;
        while (i < inner.length && depth > 0) {
          if (inner[i] === "{") depth++;
          if (inner[i] === "}") depth--;
          i++;
        }
        elements.push(this.parseArray(inner.substring(start, i)));
      } else {
        let val = "";
        while (i < inner.length && inner[i] !== this.delimiter) {
          val += inner[i];
          i++;
        }
        elements.push(this.subtype.cast(val));
      }
      if (i < inner.length && inner[i] === this.delimiter) i++;
    }

    return elements;
  }
}
