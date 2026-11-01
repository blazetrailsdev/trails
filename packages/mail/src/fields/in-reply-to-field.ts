import type { Encoding } from "@blazetrails/ruby-compat";
import { CommonMessageIdField } from "./common-message-id-field.js";

export class InReplyToField extends CommonMessageIdField {
  static readonly NAME = "In-Reply-To";

  static override isSingular(): boolean {
    return true;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    if (Array.isArray(value)) {
      super(value.join("\r\n "), charset);
    } else {
      super(value, charset);
    }
  }
}
