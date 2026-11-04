import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class FromField extends CommonAddressField {
  static readonly NAME = "From";
}
Mail.FromField = FromField;
