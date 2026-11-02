import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class ResentCcField extends CommonAddressField {
  static readonly NAME = "Resent-Cc";
}
Mail.ResentCcField = ResentCcField;
