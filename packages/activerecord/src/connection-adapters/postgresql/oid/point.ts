import { ArgumentError, kernelFloat, rbEqual } from "@blazetrails/ruby-compat";
import { ValueType } from "@blazetrails/activemodel";
import { isBlank, isPlainObject } from "@blazetrails/activesupport";
import { ActiveRecord } from "../../../namespaces.js";

ActiveRecord.Point = class Point {
  x: number;
  y: number;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  /** @noRailsEquivalent PERMANENT */
  equals(other: unknown): boolean {
    return (
      other instanceof ActiveRecord.Point && rbEqual(this.x, other.x) && rbEqual(this.y, other.y)
    );
  }
};

export class Point extends ValueType {
  override type(): string {
    return "point";
  }

  override isMutable(): boolean {
    return true;
  }

  override isChangedInPlace(rawOldValue: unknown, newValue: unknown): boolean {
    return !rbEqual(rawOldValue, this.serialize(newValue));
  }

  cast(value: unknown): unknown {
    if (typeof value === "string") {
      if (isBlank(value)) return null;

      if (value.startsWith("(") && value.endsWith(")")) {
        value = value.slice(1, -1);
      }
      const [x, y] = (value as string).split(",");
      return this.buildPoint(x, y);
    }
    if (globalThis.Array.isArray(value)) {
      if (value.length !== 2) {
        throw new ArgumentError(`wrong number of arguments (given ${value.length}, expected 2)`);
      }
      return this.buildPoint(value[0], value[1]);
    }
    if (isPlainObject(value)) {
      if (isBlank(value)) return null;

      const [x, y] = valuesArrayFromHash(value);
      return this.buildPoint(x, y);
    }
    return value;
  }

  override serialize(value: unknown): unknown {
    if (value instanceof ActiveRecord.Point) {
      return `(${this.numberForPoint(value.x)},${this.numberForPoint(value.y)})`;
    }
    if (globalThis.Array.isArray(value)) {
      if (value.length !== 2) {
        throw new ArgumentError(`wrong number of arguments (given ${value.length}, expected 2)`);
      }
      return this.serialize(this.buildPoint(value[0], value[1]));
    }
    if (isPlainObject(value)) {
      const [x, y] = valuesArrayFromHash(value);
      return this.serialize(this.buildPoint(x, y));
    }
    return super.serialize(value);
  }

  override typeCastForSchema(value: unknown): unknown {
    if (value instanceof ActiveRecord.Point) {
      return [value.x, value.y];
    }
    return super.typeCastForSchema(value);
  }

  private numberForPoint(number: unknown): string {
    const s = String(number);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  }

  /** @missingRailsName float — PERMANENT */
  private buildPoint(x: unknown, y: unknown): InstanceType<typeof ActiveRecord.Point> {
    return new ActiveRecord.Point(kernelFloat(x), kernelFloat(y));
  }
}

/** @internal */
function valuesArrayFromHash(value: Record<string, unknown>): [unknown, unknown] {
  return [value.x ?? value["x"], value.y ?? value["y"]];
}
