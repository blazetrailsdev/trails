import { registerConstant } from "@blazetrails/ruby-compat";
import { IntegerType } from "@blazetrails/activemodel";

export class UnsignedInteger extends IntegerType {
  protected override maxValue(): number | bigint {
    const max = super.maxValue();
    return typeof max === "bigint" ? max * 2n : max * 2;
  }

  protected override minValue(): number | bigint {
    return 0;
  }
}

registerConstant("ActiveRecord::Type::UnsignedInteger", UnsignedInteger);
