// vendor/rails/activerecord/test/models/matey.rb
import { Base } from "../../base.js";

export class Matey extends Base {
  static {
    this.belongsTo("pirate");
    this.belongsTo("target", { className: "Pirate" });
  }
}
