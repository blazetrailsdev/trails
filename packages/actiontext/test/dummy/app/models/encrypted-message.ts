import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Message } from "./message.js";

export class EncryptedMessage extends Message {
  static {
    (this as unknown as { hasRichText(name: string, options?: object): void }).hasRichText(
      "content",
      { encrypted: true },
    );
  }
}
constSet(TopLevel, "EncryptedMessage", EncryptedMessage);
