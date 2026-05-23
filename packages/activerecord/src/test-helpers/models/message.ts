// vendor/rails/activerecord/test/models/message.rb
import { Base } from "../../base.js";

export class Message extends Base {
  static {
    this.hasOne("entry", { as: "entryable", touch: true });
    this.hasMany("recipients");
  }
}
