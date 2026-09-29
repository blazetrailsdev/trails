import { strftime, type Temporal } from "@blazetrails/date";
import { hashDelete, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { DatetimeField } from "./datetime-field.js";

export class TimeField extends DatetimeField {
  private _includeSeconds: unknown;

  constructor(
    objectName: unknown,
    methodName: unknown,
    templateObject: unknown,
    options: Record<string, unknown> = {},
  ) {
    const includeSeconds = hashDelete(options, "includeSeconds", () => true);
    super(objectName, methodName, templateObject, options);
    this._includeSeconds = includeSeconds;
  }

  protected override formatDatetime(value: unknown): string | null {
    const format =
      this._includeSeconds != null && this._includeSeconds !== false ? "%T.%L" : "%H:%M";
    if (value == null) return null;
    return rbObjRespondTo(value, "strftime")
      ? (value as { strftime(format: string): string }).strftime(format)
      : strftime(value as Temporal.PlainDateTime, format);
  }
}
