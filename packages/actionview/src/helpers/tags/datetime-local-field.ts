import { strftime, type Temporal } from "@blazetrails/date";
import { hashDelete, rbObjRespondTo } from "@blazetrails/ruby-compat";

import { DatetimeField } from "./datetime-field.js";

export class DatetimeLocalField extends DatetimeField {
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

  static override fieldType(): string {
    if (!Object.hasOwn(this, "_fieldType")) this._fieldType = "datetime-local";
    return this._fieldType!;
  }

  protected override formatDatetime(value: unknown): string | null {
    const format =
      this._includeSeconds != null && this._includeSeconds !== false
        ? "%Y-%m-%dT%T"
        : "%Y-%m-%dT%H:%M";
    if (value == null) return null;
    return rbObjRespondTo(value, "strftime")
      ? (value as { strftime(format: string): string }).strftime(format)
      : strftime(value as Temporal.PlainDateTime, format);
  }
}
