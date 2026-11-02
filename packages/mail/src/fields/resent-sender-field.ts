import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class ResentSenderField extends CommonAddressField {
  static readonly NAME = "Resent-Sender";
}
Mail.ResentSenderField = ResentSenderField;
