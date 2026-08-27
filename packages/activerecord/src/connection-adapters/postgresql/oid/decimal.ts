import { DecimalType } from "@blazetrails/activemodel";

export class Decimal extends DecimalType {
  infinity(options: { negative?: boolean } = {}): number {
    return options.negative ? -Infinity : Infinity;
  }
}
