// vendor/rails/activerecord/test/models/section.rb
import { Base } from "../../base.js";

export class Section extends Base {
  static {
    this.belongsTo("session", { inverseOf: "sections", autosave: true });
    this.belongsTo("seminar", { inverseOf: "sections", autosave: true });
  }
}
