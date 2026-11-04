import type { Encoding } from "@blazetrails/ruby-compat";
import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class BccField extends CommonAddressField {
  static readonly NAME = "Bcc";

  includeInHeaders: boolean;

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    super(value, charset);
    this.includeInHeaders = false;
  }

  override encoded(): string {
    if (this.includeInHeaders) {
      return super.encoded();
    } else {
      return "";
    }
  }
}
Mail.BccField = BccField;
