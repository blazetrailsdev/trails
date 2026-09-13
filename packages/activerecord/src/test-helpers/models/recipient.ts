import type { Message } from "./message.js";
import { Base } from "../../base.js";

export class Recipient extends Base {
  declare email_address: string;
  declare message_id: number;

  static {
    this.belongsTo("message", { touch: true });
  }
}
export interface Recipient {
  get message(): Message | null | Promise<Message | null>;
  set message(value: Message | null);
}
