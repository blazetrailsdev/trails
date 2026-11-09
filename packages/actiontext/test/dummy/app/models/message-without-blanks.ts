import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";
import { Message } from "./message.js";

export class MessageWithoutBlanks extends ApplicationRecord {
  static {
    this.tableName = Message.tableName;
  }
}
constSet(TopLevel, "MessageWithoutBlanks", MessageWithoutBlanks);
