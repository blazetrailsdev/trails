import { hashDelete } from "@blazetrails/ruby-compat";

import { DatetimeField, strftime } from "./datetime-field.js";

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
    if (this._includeSeconds != null && this._includeSeconds !== false) {
      return value == null ? null : strftime(value, "%Y-%m-%dT%T");
    } else {
      return value == null ? null : strftime(value, "%Y-%m-%dT%H:%M");
    }
  }
}
