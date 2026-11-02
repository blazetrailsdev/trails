import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class ReplyToField extends CommonAddressField {
  static readonly NAME = "Reply-To";
}
Mail.ReplyToField = ReplyToField;
