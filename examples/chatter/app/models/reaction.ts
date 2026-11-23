import { ApplicationRecord } from "./application-record.ts";

export class Reaction extends ApplicationRecord {
  static readonly EMOJI = ["👍", "❤️", "😂", "🎉", "👀", "🙏"];

  static {
    this.belongsTo("message");
    this.belongsTo("user");
    this.validates("emoji", { inclusion: { in: Reaction.EMOJI } });
    this.validates("emoji", { uniqueness: { scope: ["message_id", "user_id"] } });
  }
}
