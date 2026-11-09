import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class ResentToField extends CommonAddressField {
  static readonly NAME = "Resent-To";
}
Mail.ResentToField = ResentToField;
