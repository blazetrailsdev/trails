import { delegate } from "@blazetrails/activesupport";
import { TopLevel } from "@blazetrails/ruby-compat";
import { ApplicationRecord } from "./application-record.js";

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    Message?: typeof Message;
  }
}

export class Message extends ApplicationRecord {
  declare content: string | null;

  static {
    delegate.call(this.prototype, "toString", { to: "content", allowNil: true });
  }
}
TopLevel.Message = Message;
