import { DecimalType } from "@blazetrails/activemodel";
import { BigDecimal, registerConstant } from "@blazetrails/activesupport";

export class Decimal extends DecimalType {
  infinity(options: { negative?: boolean } = {}): BigDecimal {
    return BigDecimal.INFINITY.mult(new BigDecimal(options.negative ? -1 : 1));
  }
}

registerConstant("ActiveRecord::ConnectionAdapters::PostgreSQL::OID::Decimal", Decimal);
