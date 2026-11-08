import { Tags } from "../../namespaces.js";
import { DatetimeField, strftime } from "./datetime-field.js";

export class DateField extends DatetimeField {
  protected override formatDatetime(value: unknown): string | null {
    return value == null ? null : strftime(value, "%Y-%m-%d");
  }
}

Tags.DateField = DateField;
