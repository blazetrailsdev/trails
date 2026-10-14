import { rbInspect, registerConstant, toS } from "@blazetrails/ruby-compat";
import { BigIntegerType } from "@blazetrails/activemodel";

export class DecimalWithoutScale extends BigIntegerType {
  override type(): string {
    return "decimal";
  }

  override typeCastForSchema(value: unknown): string {
    return rbInspect(toS(value));
  }
}

registerConstant("ActiveRecord::Type::DecimalWithoutScale", DecimalWithoutScale);
