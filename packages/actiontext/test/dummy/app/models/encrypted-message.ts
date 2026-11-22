import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Message } from "./message.js";

export class EncryptedMessage extends Message {
  static {
    this.hasRichText("content", { encrypted: true });
  }
}
constSet(TopLevel, "EncryptedMessage", EncryptedMessage);
