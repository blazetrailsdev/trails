/**
 * PostgreSQL point type — geometric point as { x, y } object.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Point
 */

export interface PointValue {
  x: number;
  y: number;
}

export class Point {
  get type(): string {
    return "point";
  }

  cast(value: unknown): PointValue | null {
    if (value == null) return null;
    if (typeof value === "object" && value !== null && "x" in value && "y" in value) {
      return { x: Number((value as PointValue).x), y: Number((value as PointValue).y) };
    }
    if (globalThis.Array.isArray(value) && value.length === 2) {
      return { x: Number(value[0]), y: Number(value[1]) };
    }
    if (typeof value === "string") {
      if (value === "") return null;
      return this.parsePoint(value);
    }
    return null;
  }

  serialize(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "object" && value !== null && "x" in value && "y" in value) {
      const p = value as PointValue;
      return `(${p.x},${p.y})`;
    }
    if (globalThis.Array.isArray(value) && value.length === 2) {
      return `(${value[0]},${value[1]})`;
    }
    if (typeof value === "string") return value;
    return null;
  }

  deserialize(value: unknown): PointValue | null {
    return this.cast(value);
  }

  private parsePoint(str: string): PointValue | null {
    const cleaned = str.replace(/[()]/g, "").trim();
    const parts = cleaned.split(",").map((s) => s.trim());
    if (parts.length !== 2) return null;
    const x = parseFloat(parts[0]);
    const y = parseFloat(parts[1]);
    if (isNaN(x) || isNaN(y)) return null;
    return { x, y };
  }
}
