// vendor/rails/activerecord/test/models/attachment.rb
import { Base } from "../../base.js";

export class Attachment extends Base {
  static {
    this.belongsTo("record", { polymorphic: true });
    this.hasOne("translation");
  }
}
