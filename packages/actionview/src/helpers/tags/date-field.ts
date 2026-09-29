import { strftime, type Temporal } from "@blazetrails/date";
import { rbObjRespondTo } from "@blazetrails/ruby-compat";

import { DatetimeField } from "./datetime-field.js";

export class DateField extends DatetimeField {
  protected override formatDatetime(value: unknown): string | null {
    if (value == null) return null;
    return rbObjRespondTo(value, "strftime")
      ? (value as { strftime(format: string): string }).strftime("%Y-%m-%d")
      : strftime(value as Temporal.PlainDate, "%Y-%m-%d");
  }
}
