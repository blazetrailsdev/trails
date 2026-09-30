import { registerConstant } from "@blazetrails/activesupport";
import { IntegerType } from "@blazetrails/activemodel";

export class UnsignedInteger extends IntegerType {
  protected override maxValue(): number {
    return super.maxValue() * 2;
  }

  protected override minValue(): number {
    return 0;
  }
}

registerConstant("ActiveRecord::Type::UnsignedInteger", UnsignedInteger);
