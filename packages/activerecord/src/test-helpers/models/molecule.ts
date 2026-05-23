// vendor/rails/activerecord/test/models/molecule.rb
import { Base } from "../../base.js";

export class Molecule extends Base {
  static {
    this.belongsTo("liquid");
    this.hasMany("electrons");
  }
}
