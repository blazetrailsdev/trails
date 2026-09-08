import { DecimalType } from "@blazetrails/activemodel";
import { BigDecimal } from "@blazetrails/activesupport";

export class Decimal extends DecimalType {
  infinity(options: { negative?: boolean } = {}): BigDecimal {
    return BigDecimal.INFINITY.mult(new BigDecimal(options.negative ? -1 : 1));
  }
}
