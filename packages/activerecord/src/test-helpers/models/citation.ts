// vendor/rails/activerecord/test/models/citation.rb
import { Base } from "../../base.js";

export class Citation extends Base {
  static {
    this.belongsTo("book", { foreignKey: "book1_id", inverseOf: "citations", touch: true });
    this.belongsTo("referenceOf", { className: "Book", foreignKey: "book2_id" });
    this.hasMany("citations");
  }
}
