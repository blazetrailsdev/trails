import { BigIntegerType } from "@blazetrails/activemodel";

export class DecimalWithoutScale extends BigIntegerType {
  override readonly name: string = "decimal";

  override type(): string {
    return "decimal";
  }

  override typeCastForSchema(value: unknown): string {
    const s = value == null ? "" : String(value);
    return JSON.stringify(s);
  }
}
