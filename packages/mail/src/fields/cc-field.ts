import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class CcField extends CommonAddressField {
  static readonly NAME = "Cc";
}
Mail.CcField = CcField;
