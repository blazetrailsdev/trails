import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  override serializeCastValue(value: number | bigint | null): number | bigint | null {
    return value;
  }

  protected override maxValue(): number {
    return Number.POSITIVE_INFINITY;
  }
}
