import type { Message } from "./message.js";
import { Base } from "../../base.js";

export class Recipient extends Base {
  declare message: Message | null | Promise<Message | null>;
  declare email_address: string;
  declare message_id: number;

  static {
    this.belongsTo("message", { touch: true });
  }
}
