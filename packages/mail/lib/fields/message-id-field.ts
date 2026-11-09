import type { Encoding } from "@blazetrails/ruby-compat";
import { Utilities } from "../utilities.js";
import { CommonMessageIdField } from "./common-message-id-field.js";
import { Mail } from "../mail.js";

export class MessageIdField extends CommonMessageIdField {
  static readonly NAME = "Message-ID";

  static override isSingular(): boolean {
    return true;
  }

  constructor(value: unknown = null, charset: string | Encoding | null = null) {
    if (Utilities.isBlank(value)) value = Utilities.generateMessageId();
    super(value, charset);
  }

  override messageIds(): (string | null)[] {
    return [this.messageId()];
  }
}
Mail.MessageIdField = MessageIdField;
