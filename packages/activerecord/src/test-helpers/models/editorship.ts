// vendor/rails/activerecord/test/models/editorship.rb
import { Base } from "../../base.js";

export class Editorship extends Base {
  static {
    this.belongsTo("publication");
    this.belongsTo("editor");
  }
}
