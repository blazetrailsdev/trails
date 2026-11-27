import { ArgumentError } from "@blazetrails/ruby-compat/argument-error";
import { TimezoneDefiner as Format2TimezoneDefiner } from "../format2/timezone-definer.js";

/** @internal */
export class TimezoneDefiner extends Format2TimezoneDefiner {
  override offset(id: string, utcOffset: number, stdOffset: number, abbreviation: string): void {
    super.offset(id, utcOffset, stdOffset, String(abbreviation));
  }

  override transition(
    year: number | string,
    month: number,
    offsetId: string,
    timestampValue: number,
    datetimeNumerator: number | null = null,
    datetimeDenominator: number | null = null,
  ): void {
    if (datetimeNumerator != null && datetimeDenominator == null) {
      throw new ArgumentError("DateTime-only transitions are not supported");
    }
    super.transition(offsetId, timestampValue);
  }
}

Object.defineProperty(TimezoneDefiner.prototype, "subsequentRules", { value: undefined });
