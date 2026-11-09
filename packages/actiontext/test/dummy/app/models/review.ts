import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Message } from "./message.js";
import { ApplicationRecord } from "./application-record.js";

export class Review extends ApplicationRecord {
  declare author_name: string;
  declare message: Message | null | Promise<Message | null>;

  static {
    this.belongsTo("message");
  }
}
constSet(TopLevel, "Review", Review);
