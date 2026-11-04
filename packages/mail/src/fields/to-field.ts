import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class ToField extends CommonAddressField {
  static readonly NAME = "To";
}
Mail.ToField = ToField;
