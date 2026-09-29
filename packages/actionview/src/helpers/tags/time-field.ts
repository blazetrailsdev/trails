import { hashDelete } from "@blazetrails/ruby-compat";

import { DatetimeField, strftime } from "./datetime-field.js";

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
    if (this._includeSeconds != null && this._includeSeconds !== false) {
      return value == null ? null : strftime(value, "%T.%L");
    } else {
      return value == null ? null : strftime(value, "%H:%M");
    }
  }
}
