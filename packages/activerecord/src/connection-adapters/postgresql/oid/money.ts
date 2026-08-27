import { BigDecimal } from "@blazetrails/activesupport";
import { DecimalType } from "@blazetrails/activemodel";

export class Money extends DecimalType {
  override readonly name: string = "money";

  constructor(options?: { precision?: number; limit?: number }) {
    super(options);
  }

  override type(): string {
    return "money";
  }

  override get scale(): number {
    return 2;
  }

  override castValue(value: unknown): BigDecimal | string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return super.castValue(value);

    let str = value.replace(/^\((.+)\)$/, "-$1");

    if (/^-?[^0-9,.]*[\d,]+\.\d{2}$/.test(str)) {
      str = str.replace(/[^\-0-9.]/g, "");
    } else if (/^-?[^0-9,.]*[\d.]+,\d{2}$/.test(str)) {
      str = str.replace(/[^\-0-9,]/g, "").replace(/,/g, ".");
    }

    return super.castValue(str);
  }
}
