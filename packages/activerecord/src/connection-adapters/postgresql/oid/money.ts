import "../../../constants.postgresql-oid-money.generated.js";

import { ConnectionAdapters } from "../../../namespaces.js";
import { BigDecimal } from "@blazetrails/activesupport";

import { DecimalType } from "@blazetrails/activemodel";

export class Money extends DecimalType {
  override type(): string {
    return "money";
  }

  override get scale(): number {
    return 2;
  }

  override castValue(value: unknown): BigDecimal | null {
    if (typeof value !== "string") return value as BigDecimal | null;

    value = value.replace(/^\((.+)\)$/, "-$1");
    if (/^-?[^0-9,.]*[\d,]+\.\d{2}$/.test(value as string)) {
      value = (value as string).replace(/[^\-0-9.]/g, "");
    } else if (/^-?[^0-9,.]*[\d.]+,\d{2}$/.test(value as string)) {
      value = (value as string).replace(/[^\-0-9,]/g, "");
      value = (value as string).replace(/,/g, ".");
    }

    return super.castValue(value);
  }
}

ConnectionAdapters.PostgreSQL.OID.Money = Money;
