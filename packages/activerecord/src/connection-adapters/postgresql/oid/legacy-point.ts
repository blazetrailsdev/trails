import { kernelFloat, rbEqual } from "@blazetrails/ruby-compat";
import { ValueType } from "@blazetrails/activemodel";

export class LegacyPoint extends ValueType {
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
      if (value.startsWith("(") && value.endsWith(")")) {
        value = value.slice(1, -1);
      }
      return this.cast((value as string).split(","));
    }
    if (globalThis.Array.isArray(value)) {
      return value.map((v) => kernelFloat(v));
    }
    return value;
  }

  override serialize(value: unknown): unknown {
    if (globalThis.Array.isArray(value)) {
      return `(${this.numberForPoint(value[0])},${this.numberForPoint(value[1])})`;
    }
    return super.serialize(value);
  }

  private numberForPoint(number: unknown): string {
    const s = String(number);
    return s.endsWith(".0") ? s.slice(0, -2) : s;
  }
}
