import type { Message } from "./message.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Recipient extends Base {
  declare email_address: string;
  declare message_id: number;

  static {
    this.belongsTo("message", { touch: true });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Recipient {
  get message(): Message | null | Promise<Message | null>;
  set message(value: Message | null);
}
