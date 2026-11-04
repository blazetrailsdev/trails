import { CommonDateField } from "./common-date-field.js";
import { Mail } from "../mail.js";

export class DateField extends CommonDateField {
  static readonly NAME = "Date";
}
Mail.DateField = DateField;
