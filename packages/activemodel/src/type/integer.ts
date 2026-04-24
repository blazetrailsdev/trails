import { ValueType } from "./value.js";
import { ActiveModelRangeError } from "../errors.js";

export class IntegerType extends ValueType<number> {
  readonly name: string = "integer";
  private readonly _range: [number, number];

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    super(options);
    const byteLimit = this.limit ?? 4;
    const max = 2 ** (byteLimit * 8 - 1);
    this._range = [-max, max - 1];
  }

  cast(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "number") {
      if (isNaN(value)) return null;
      return Math.trunc(value);
    }
    const parsed = parseInt(String(value), 10);
    return isNaN(parsed) ? null : parsed;
  }

  serialize(value: unknown): unknown {
    const result = this.cast(value);
    if (result !== null && (result < this._range[0] || result > this._range[1])) {
      // Rails message shape
      // (activemodel/lib/active_model/type/integer.rb:95):
      //   "#{value} is out of range for #{self.class} with limit #{_limit} bytes"
      const klass = (this.constructor as { name: string }).name;
      throw new ActiveModelRangeError(
        `${result} is out of range for ${klass} with limit ${this.limit ?? 4} bytes`,
      );
    }
    return result;
  }

  type(): string {
    return this.name;
  }

  serializeCastValue(value: number | null): number | null {
    return value;
  }

  isSerializable(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    const num = typeof value === "number" ? value : Number(value);
    if (isNaN(num)) return false;
    return num >= this._range[0] && num <= this._range[1];
  }
}
