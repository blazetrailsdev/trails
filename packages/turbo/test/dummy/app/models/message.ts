import { delegate } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

export class Message extends ApplicationRecord {
  declare content: string | null;

  static {
    delegate.call(this.prototype, "toString", { to: "content", allowNil: true });
  }
}
constSet(TopLevel, "Message", Message);
