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

export function serializePoint(point: PgPoint | null): string | null {
  if (!point) return null;
  return `(${point.x},${point.y})`;
}

export function parseLine(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed;
}

export function parseLseg(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed;
}

export function parseBox(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed;
}

export function parsePath(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed;
}

export function parsePolygon(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed;
}

export function parseCircle(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed === "") return null;
  return trimmed;
}
