import { ValueType } from "./value.js";

export class BooleanType extends ValueType<boolean> {
  readonly name = "boolean";

  static readonly FALSE_VALUES: ReadonlySet<unknown> = new Set([
    false,
    0,
    0n,
    "0",
    ":0",
    "f",
    ":f",
    "F",
    ":F",
    "false",
    ":false",
    "FALSE",
    ":FALSE",
    "off",
    ":off",
    "OFF",
    ":OFF",
  ]);

  type(): string {
    return "boolean";
  }

  serialize(value: unknown): boolean | null {
    return this.cast(value);
  }

  serializeCastValue(value: boolean | null): boolean | null {
    return value;
  }

  /** @internal */
  protected castValue(value: unknown): boolean | null {
    if (value === "") return null;
    return !BooleanType.FALSE_VALUES.has(value);
  }
}
