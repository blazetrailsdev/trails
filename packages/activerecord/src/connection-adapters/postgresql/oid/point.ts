/**
 * PostgreSQL point type — geometric (x, y) point.
 *
 * Mirrors: ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Point.
 * Rails: `class Point < Type::Value; include Helpers::Mutable`. Plus a
 * `ActiveRecord::Point = Struct.new(:x, :y)` value struct at the outer
 * namespace. In TS we expose both as a `PointValue` class (Rails'
 * struct) and the `Point` Type::Value (the OID class).
 */

import { ValueType } from "@blazetrails/activemodel";

/**
 * Mirrors Rails' `ActiveRecord::Point = Struct.new(:x, :y)`.
 */
export class PointValue {
  readonly x: number;
  readonly y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
}

export class Point extends ValueType<PointValue> {
  readonly name: string = "point";

  override type(): string {
    return "point";
  }

  /** Rails' Helpers::Mutable sets mutable? = true. */
  override isMutable(): boolean {
    return true;
  }

  /**
   * Rails' Mutable compares serialized forms so in-place mutation on a
   * returned Point (e.g. a stored value being modified via reference)
   * correctly marks the attribute dirty.
   */
  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return rawOldValue !== this.serialize(newValue);
  }

  cast(value: unknown): PointValue | null {
    if (value == null) return null;
    if (value instanceof PointValue) return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return null;
      let inner = trimmed;
      if (inner.startsWith("(") && inner.endsWith(")")) {
        inner = inner.slice(1, -1);
      }
      const parts = inner.split(",");
      if (parts.length !== 2) return null;
      return this.buildPoint(parts[0], parts[1]);
    }
    if (globalThis.Array.isArray(value)) {
      // Rails: `when ::Array then build_point(*value)` — ArgumentError on
      // non-2-element arrays. Mirror that by returning null.
      if (value.length !== 2) return null;
      return this.buildPoint(value[0], value[1]);
    }
    if (typeof value === "object") {
      const hash = value as Record<string, unknown>;
      if (Object.keys(hash).length === 0) return null;
      const [x, y] = valuesArrayFromHash(hash);
      return this.buildPoint(x, y);
    }
    return null;
  }

  override serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof PointValue) {
      return `(${numberForPoint(value.x)},${numberForPoint(value.y)})`;
    }
    if (globalThis.Array.isArray(value)) {
      if (value.length !== 2) return null;
      return this.serialize(this.buildPoint(value[0], value[1]));
    }
    if (typeof value === "object") {
      const [x, y] = valuesArrayFromHash(value as Record<string, unknown>);
      return this.serialize(this.buildPoint(x, y));
    }
    // Rails' else branch is `super` → Type::Value#serialize (identity).
    // Pass through string inputs (e.g. migration defaults like
    // "(12.2,13.3)") so quoteDefaultExpression doesn't turn them into
    // DEFAULT NULL. Other scalars can't honestly satisfy the string | null
    // contract, so null them out.
    if (typeof value === "string") return value;
    return null;
  }

  override typeCastForSchema(value: unknown): string {
    if (value instanceof PointValue) {
      return `[${value.x}, ${value.y}]`;
    }
    return super.typeCastForSchema(value);
  }

  /**
   * Rails uses `Float(x)` which raises on empty / whitespace input. JS
   * `Number("")` returns 0, so `(,)` or `['', '']` would cast to `(0,0)`
   * without this guard. Reject blank coordinates explicitly.
   */
  private toCoordinate(value: unknown): number | null {
    if (typeof value === "string" && value.trim() === "") return null;
    const n = Number(value);
    return Number.isNaN(n) ? null : n;
  }

  private buildPoint(x: unknown, y: unknown): PointValue | null {
    const fx = this.toCoordinate(x);
    const fy = this.toCoordinate(y);
    if (fx == null || fy == null) return null;
    return new PointValue(fx, fy);
  }
}

/** Mirrors Rails' `number.to_s.delete_suffix(".0")` — drop trailing .0 on ints. */
function numberForPoint(n: number): string {
  const s = String(n);
  return s.endsWith(".0") ? s.slice(0, -2) : s;
}

/** Mirrors Rails' `value.values_at(:x, "x").compact.first` for both keys. */
function valuesArrayFromHash(hash: Record<string, unknown>): [unknown, unknown] {
  return [hash.x ?? hash["x"], hash.y ?? hash["y"]];
}
