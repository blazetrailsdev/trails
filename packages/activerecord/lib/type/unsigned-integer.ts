import { numericMul } from "@blazetrails/ruby-compat";
import { IntegerType } from "@blazetrails/activemodel";

export class UnsignedInteger extends IntegerType {
  protected override maxValue(): number | bigint {
    return numericMul(super.maxValue(), 2) as number | bigint;
  }

  protected override minValue(): number | bigint {
    return 0;
  }
}
