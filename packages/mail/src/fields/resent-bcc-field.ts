import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class ResentBccField extends CommonAddressField {
  static readonly NAME = "Resent-Bcc";
}
Mail.ResentBccField = ResentBccField;
