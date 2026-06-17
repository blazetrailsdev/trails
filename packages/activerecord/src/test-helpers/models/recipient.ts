import type { Message } from "./message.js";
// vendor/rails/activerecord/test/models/recipient.rb
import { Base } from "../../base.js";

export class Recipient extends Base {
  declare message: Message | null;
  declare loadBelongsTo: (name: "message") => Promise<Message | null>;
  declare email_address: string;
  declare message_id: number;

  static {
    this.belongsTo("message", { touch: true });
  }
}
