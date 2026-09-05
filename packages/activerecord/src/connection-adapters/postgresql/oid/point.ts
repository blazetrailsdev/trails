import { kernelFloat, rbEqual } from "@blazetrails/ruby-compat";
import { ValueType } from "@blazetrails/activemodel";

/** @noRailsEquivalent PERMANENT */
export class PointValue {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** @noRailsEquivalent PERMANENT */
  equals(other: unknown): boolean {
    return other instanceof PointValue && rbEqual(this.x, other.x) && rbEqual(this.y, other.y);
  }
}

export class Point extends ValueType<PointValue> {
  override type(): string {
    return "point";
  }

  override isMutable(): boolean {
    return true;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return !rbEqual(rawOldValue, this.serialize(newValue));
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
      if (value.length !== 2) return null;
      return this.buildPoint(value[0], value[1]);
    }
    if (typeof value === "object") {
      if (Object.keys(value as Record<string, unknown>).length === 0) return null;
      const [x, y] = valuesArrayFromHash(value as Record<string, unknown>);
      return this.buildPoint(x, y);
    }
    return null;
  }

  override serialize(value: unknown): string | null {
    if (value == null) return null;
    if (value instanceof PointValue) {
      return `(${this.numberForPoint(value.x)},${this.numberForPoint(value.y)})`;
    }
    if (globalThis.Array.isArray(value)) {
      if (value.length !== 2) return null;
      return this.serialize(this.buildPoint(value[0], value[1]));
    }
    if (typeof value === "object") {
      const [x, y] = valuesArrayFromHash(value as Record<string, unknown>);
      return this.serialize(this.buildPoint(x, y));
    }
    if (typeof value === "string") return value;
    return null;
  }

  override typeCastForSchema(value: unknown): string {
    if (value instanceof PointValue) {
      return `[${value.x}, ${value.y}]`;
    }
    return super.typeCastForSchema(value);
  }

  private numberForPoint(number: unknown): string {
    const s = String(number);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  }

  private buildPoint(x: unknown, y: unknown): PointValue {
    return new PointValue(kernelFloat(x), kernelFloat(y));
  }
}

/** @internal */
function valuesArrayFromHash(value: Record<string, unknown>): [unknown, unknown] {
  return [value.x ?? value["x"], value.y ?? value["y"]];
}
