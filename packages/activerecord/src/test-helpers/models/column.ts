// vendor/rails/activerecord/test/models/column.rb
import { Base } from "../../base.js";

export class Column extends Base {
  static {
    this.belongsTo("record");
  }
}
