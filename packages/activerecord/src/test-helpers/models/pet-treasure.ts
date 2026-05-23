// vendor/rails/activerecord/test/models/pet_treasure.rb
import { Base } from "../../base.js";

export class PetTreasure extends Base {
  static {
    this._tableName = "pets_treasures";
    this.belongsTo("pet");
    this.belongsTo("treasure");
  }
}
