/**
 * PostgreSQL geometric type support.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Point,
 *          ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Lseg, etc.
 */

/**
 * A 2D point. Mirrors ActiveRecord::Point.
 */
export class PgPoint {
  constructor(
    public x: number,
    public y: number,
  ) {}

  toString(): string {
    return `(${this.x},${this.y})`;
  }

  toArray(): [number, number] {
    return [this.x, this.y];
  }
}

function finitePointOrNull(x: number, y: number): PgPoint | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return new PgPoint(x, y);
}

/**
 * Parse a PG point value into a PgPoint.
 * Accepts strings like "(1.5,2.3)" or objects like {x: 1.5, y: 2.3}
 * (the pg driver returns point columns as objects).
 */
export function parsePoint(value: unknown): PgPoint | null {
  if (value == null || value === "") return null;
  if (value instanceof PgPoint) return value;
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (obj.x != null && obj.y != null) return finitePointOrNull(Number(obj.x), Number(obj.y));
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  const match = s.match(/^\(?\s*([^,\s]+)\s*,\s*([^)\s]+)\s*\)?$/);
  if (!match) return null;
  return finitePointOrNull(parseFloat(match[1]), parseFloat(match[2]));
}

/**
 * Convert various input formats to a PgPoint.
 */
export function castPoint(value: unknown): PgPoint | null {
  if (value == null) return null;
  if (value instanceof PgPoint) return value;
  if (typeof value === "string") return parsePoint(value);
  if (Array.isArray(value) && value.length === 2) {
    return finitePointOrNull(Number(value[0]), Number(value[1]));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const x = obj.x ?? obj.X;
    const y = obj.y ?? obj.Y;
    if (x != null && y != null) return finitePointOrNull(Number(x), Number(y));
  }
  return null;
}

/**
 * Serialize a PgPoint to PG literal.
 */
export function serializePoint(point: PgPoint | null): string | null {
  if (!point) return null;
  return `(${point.x},${point.y})`;
}

/**
 * Return the trimmed string representation of a PG line value.
 */
export function parseLine(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Return the trimmed string representation of a PG lseg value.
 */
export function parseLseg(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Return the trimmed string representation of a PG box value.
 */
export function parseBox(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Return the trimmed string representation of a PG path value.
 */
export function parsePath(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Return the trimmed string representation of a PG polygon value.
 */
export function parsePolygon(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Return the trimmed string representation of a PG circle value.
 */
export function parseCircle(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}
