import { CommonMessageIdField } from "./common-message-id-field.js";
import { Mail } from "../mail.js";

export class ResentMessageIdField extends CommonMessageIdField {
  static readonly NAME = "Resent-Message-ID";
}
Mail.ResentMessageIdField = ResentMessageIdField;
