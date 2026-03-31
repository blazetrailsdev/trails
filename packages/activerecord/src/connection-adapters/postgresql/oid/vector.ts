/**
 * PostgreSQL vector type — used for pgvector extension.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Vector
 */

export class Vector {
  get type(): string {
    return "vector";
  }

  cast(value: unknown): number[] | null {
    if (value == null) return null;
    if (globalThis.Array.isArray(value)) return value.map(Number);
    if (typeof value === "string") {
      if (value === "") return null;
      return this.parseVector(value);
    }
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (globalThis.Array.isArray(value)) {
      return `[${value.join(",")}]`;
    }
    if (typeof value === "string") return value;
    return null;
  }

  deserialize(value: unknown): number[] | null {
    return this.cast(value);
  }

  private parseVector(str: string): number[] | null {
    const cleaned = str.replace(/[[\]]/g, "").trim();
    if (cleaned === "") return [];
    const values = cleaned.split(",").map((s) => parseFloat(s.trim()));
    if (values.some((v) => !Number.isFinite(v))) return null;
    return values;
  }
}
