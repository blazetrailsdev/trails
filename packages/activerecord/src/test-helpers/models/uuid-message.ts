// vendor/rails/activerecord/test/models/uuid_message.rb
import { Base } from "../../base.js";

export class UuidMessage extends Base {
  static {
    this.hasOne("uuidEntry", { as: "entryable" });
  }
}
