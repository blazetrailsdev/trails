/**
 * Mirrors: ActiveRecord::Type::DecimalWithoutScale
 */
import { BigIntegerType } from "@blazetrails/activemodel";

export class DecimalWithoutScale extends (BigIntegerType as new () => Omit<
  BigIntegerType,
  "name"
> & { name: string }) {
  readonly name = "decimal";
}
