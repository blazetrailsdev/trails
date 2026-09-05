import { IntegerType } from "./integer.js";

export class BigIntegerType extends IntegerType {
  override serializeCastValue(value: number | bigint | null): number | bigint | null {
    return value;
  }

  protected override maxValue(): number {
    return Number.POSITIVE_INFINITY;
  }

  /** @internal */
  protected override castValue(value: unknown): number | bigint | null {
    if (typeof value === "bigint") return this.narrowBigInt(value);
    if (typeof value === "number") {
      if (isNaN(value) || !isFinite(value)) return null;
      return this.narrowBigInt(BigInt(Math.trunc(value)));
    }
    if (typeof value === "string") {
      const lead = value.trim().match(/^([+-]?\d+)/)?.[1];
      if (!lead) return 0;
      return this.narrowBigInt(BigInt(lead.startsWith("+") ? lead.slice(1) : lead));
    }
    return super.castValue(value);
  }
}
