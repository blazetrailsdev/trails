// vendor/rails/activerecord/test/models/recipient.rb
import { Base } from "../../base.js";

export class Recipient extends Base {
  static {
    this.belongsTo("message", { touch: true });
  }
}
