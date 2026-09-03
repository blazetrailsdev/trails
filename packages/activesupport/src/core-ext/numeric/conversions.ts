import { NumberHelper } from "../../number-helper.js";
import { BigDecimal } from "../big-decimal/conversions.js";

export namespace NumericWithFormat {
  export function toFs(
    self: number | BigDecimal,
    format: number | string | null = null,
    options: Record<string, unknown> | null = null,
  ): string {
    if (format === null) return self.toString();

    if (typeof format === "number" || !format.startsWith(":")) {
      return self instanceof BigDecimal
        ? self.toString(String(format))
        : self.toString(format as number);
    }

    switch (format) {
      case ":phone":
        return NumberHelper.numberToPhone(self, options ?? {}) as string;
      case ":currency":
        return NumberHelper.numberToCurrency(self, options ?? {}) as string;
      case ":percentage":
        return NumberHelper.numberToPercentage(self, options ?? {}) as string;
      case ":delimited":
        return NumberHelper.numberToDelimited(self, options ?? {}) as string;
      case ":rounded":
        return NumberHelper.numberToRounded(self, options ?? {}) as string;
      case ":human":
        return NumberHelper.numberToHuman(self, options ?? {}) as string;
      case ":human_size":
        return NumberHelper.numberToHumanSize(self, options ?? {}) as string;
      default:
        return self.toString();
    }
  }

  export const toFormattedS = toFs;
}
