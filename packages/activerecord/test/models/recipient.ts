import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Message } from "./message.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Recipient extends Base {
  declare email_address: string;
  declare message_id: number;

  static {
    this.belongsTo("message", { touch: true });
  }
}
constSet(TopLevel, "Recipient", Recipient);
DescendantsTracker.registerSubclass(Base, Recipient);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Recipient {
  get message(): Message | null | Promise<Message | null>;
  set message(value: Message | null);
}
