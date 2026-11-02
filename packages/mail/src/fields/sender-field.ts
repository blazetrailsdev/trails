import { rbFArray } from "@blazetrails/ruby-compat";
import { CommonAddressField } from "./common-address-field.js";
import { Mail } from "../mail.js";

export class SenderField extends CommonAddressField {
  static readonly NAME = "Sender";

  static override isSingular(): boolean {
    return true;
  }

  override default(): unknown {
    return this.address();
  }

  override addresses(): (string | null)[] {
    return rbFArray(super.addresses()[0] ?? null) as (string | null)[];
  }
}
Mail.SenderField = SenderField;
