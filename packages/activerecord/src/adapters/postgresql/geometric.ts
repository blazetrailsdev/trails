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

/**
 * Parse a PG point string like "(1.5,2.3)" into a PgPoint.
 */
export function parsePoint(value: string | null | undefined): PgPoint | null {
  if (value == null || value === "") return null;
  const s = value.trim();
  const match = s.match(/^\(?\s*([^,\s]+)\s*,\s*([^)\s]+)\s*\)?$/);
  if (!match) return null;
  return new PgPoint(parseFloat(match[1]), parseFloat(match[2]));
}

/**
 * Convert various input formats to a PgPoint.
 */
export function castPoint(value: unknown): PgPoint | null {
  if (value == null) return null;
  if (value instanceof PgPoint) return value;
  if (typeof value === "string") return parsePoint(value);
  if (Array.isArray(value) && value.length === 2) {
    return new PgPoint(Number(value[0]), Number(value[1]));
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const x = obj.x ?? obj.X;
    const y = obj.y ?? obj.Y;
    if (x != null && y != null) return new PgPoint(Number(x), Number(y));
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
 * Parse a PG line string like "{a,b,c}" into [a,b,c].
 */
export function parseLine(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Parse a PG lseg string like "[(x1,y1),(x2,y2)]".
 */
export function parseLseg(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Parse a PG box string like "(x1,y1),(x2,y2)".
 */
export function parseBox(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Parse a PG path string like "[(x1,y1),(x2,y2),...]" or "((x1,y1),...)".
 */
export function parsePath(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Parse a PG polygon string like "((x1,y1),(x2,y2),...)".
 */
export function parsePolygon(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}

/**
 * Parse a PG circle string like "<(x,y),r>".
 */
export function parseCircle(value: string | null | undefined): string | null {
  if (value == null || value === "") return null;
  return value.trim();
}
