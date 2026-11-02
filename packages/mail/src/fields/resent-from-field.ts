import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class ResentFromField extends CommonAddressField {
  static readonly NAME = "Resent-From";
}
Mail.ResentFromField = ResentFromField;
