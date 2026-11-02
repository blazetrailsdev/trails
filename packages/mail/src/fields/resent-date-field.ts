import { CommonDateField } from "./common-date-field.js";
import { Mail } from "../mail.js";

export class ResentDateField extends CommonDateField {
  static readonly NAME = "Resent-Date";
}
Mail.ResentDateField = ResentDateField;
