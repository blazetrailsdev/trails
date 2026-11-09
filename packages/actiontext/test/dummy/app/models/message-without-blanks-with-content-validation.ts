import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { MessageWithoutBlanks } from "./message-without-blanks.js";

export class MessageWithoutBlanksWithContentValidation extends MessageWithoutBlanks {
  static {
    this.validates("content", { presence: true });
  }
}
constSet(
  TopLevel,
  "MessageWithoutBlanksWithContentValidation",
  MessageWithoutBlanksWithContentValidation,
);
