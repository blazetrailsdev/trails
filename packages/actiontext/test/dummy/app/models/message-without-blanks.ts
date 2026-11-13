import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";
import { Message } from "./message.js";

export class MessageWithoutBlanks extends ApplicationRecord {
  static {
    this.tableName = Message.tableName;

    (this as unknown as { hasRichText(name: string, options?: object): void }).hasRichText(
      "content",
      { storeIfBlank: false },
    );
  }
}
constSet(TopLevel, "MessageWithoutBlanks", MessageWithoutBlanks);
