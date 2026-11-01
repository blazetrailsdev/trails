import type { Encoding } from "@blazetrails/ruby-compat";
import { CommonMessageIdField } from "./common-message-id-field.js";

export class ReferencesField extends CommonMessageIdField {
  static readonly NAME = "References";

  static override isSingular(): boolean {
    return true;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    if (Array.isArray(value)) value = value.join("\r\n ");
    super(value, charset);
  }
}
