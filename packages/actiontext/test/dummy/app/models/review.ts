import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Message } from "./message.js";
import { ApplicationRecord } from "./application-record.js";

export class Review extends ApplicationRecord {
  declare author_name: string;
  declare message: Message | null | Promise<Message | null>;

  static {
    this.belongsTo("message");

    (this as unknown as { hasRichText(name: string, options?: object): void }).hasRichText(
      "content",
    );
  }
}
constSet(TopLevel, "Review", Review);
