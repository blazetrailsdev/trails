// vendor/rails/activerecord/test/models/entrant.rb
import { Base } from "../../base.js";

export class Entrant extends Base {
  static {
    this.belongsTo("course");
  }
}
