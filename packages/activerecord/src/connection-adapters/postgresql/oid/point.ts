import {
  kernelFloat,
  rbEqual,
  rbObjAsString,
  registerConstant,
  Struct,
} from "@blazetrails/ruby-compat";
import { ValueType } from "@blazetrails/activemodel";
import { isBlank, isPlainObject } from "@blazetrails/activesupport";
import { ActiveRecord } from "../../../namespaces.js";

ActiveRecord.Point = class Point extends Struct.new("x", "y") {
  declare x: number;
  declare y: number;

  constructor(x: number, y: number) {
    super(x, y);
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
      return this.buildPoint(...(value as [unknown, unknown]));
    }
    if (isPlainObject(value)) {
      if (isBlank(value)) return null;

      return this.buildPoint(...valuesArrayFromHash(value));
    }
    return value;
  }

  override serialize(value: unknown): unknown {
    if (value instanceof ActiveRecord.Point) {
      return `(${this.numberForPoint(value.x)},${this.numberForPoint(value.y)})`;
    }
    if (globalThis.Array.isArray(value)) {
      return this.serialize(this.buildPoint(...(value as [unknown, unknown])));
    }
    if (isPlainObject(value)) {
      return this.serialize(this.buildPoint(...valuesArrayFromHash(value)));
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
    return rbObjAsString(number).replace(/\.0$/, "");
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

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Point", Point);
