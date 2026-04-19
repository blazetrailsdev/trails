import { ValueType } from "./value.js";

export class BooleanType extends ValueType<boolean> {
  readonly name = "boolean";

  private static readonly TRUE_VALUES: ReadonlySet<unknown> = new Set([
    true,
    1,
    "1",
    "t",
    "T",
    "true",
    "TRUE",
    "on",
    "ON",
    "yes",
    "YES",
  ]);
  private static readonly FALSE_VALUES: ReadonlySet<unknown> = new Set([
    false,
    0,
    "0",
    "f",
    "F",
    "false",
    "FALSE",
    "off",
    "OFF",
    "no",
    "NO",
  ]);

  cast(value: unknown): boolean | null {
    if (value === null || value === undefined) return null;
    if (value === "") return null;
    if (BooleanType.TRUE_VALUES.has(value)) return true;
    if (BooleanType.FALSE_VALUES.has(value)) return false;
    return null;
  }

  serialize(value: unknown): boolean | null {
    return this.cast(value);
  }

  type(): string {
    return this.name;
  }

  serializeCastValue(value: boolean | null): boolean | null {
    return value;
  }
}
