import { Tags } from "../../namespaces.js";
import { rbModConstSet } from "@blazetrails/ruby-compat";
import { DatetimeField, strftime } from "./datetime-field.js";

export class MonthField extends DatetimeField {
  protected override formatDatetime(value: unknown): string | null {
    return value == null ? null : strftime(value, "%Y-%m");
  }
}

rbModConstSet(Tags, "MonthField", MonthField);
