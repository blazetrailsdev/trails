// vendor/rails/activerecord/test/models/paragraph.rb
import { Base } from "../../base.js";

export class Paragraph extends Base {
  static {
    this.belongsTo("book");
  }
}
