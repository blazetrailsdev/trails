import "../../../constants.postgresql-oid-decimal.generated.js";

import { ConnectionAdapters } from "../../../namespaces.js";
import { DecimalType } from "@blazetrails/activemodel";
import { BigDecimal } from "@blazetrails/activesupport";

export class Decimal extends DecimalType {
  infinity(options: { negative?: boolean } = {}): BigDecimal {
    return BigDecimal.INFINITY.mult(new BigDecimal(options.negative ? -1 : 1));
  }
}

ConnectionAdapters.PostgreSQL.OID.Decimal = Decimal;
