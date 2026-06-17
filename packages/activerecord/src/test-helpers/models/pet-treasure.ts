import type { Pet } from "./pet.js";
import type { Treasure } from "./treasure.js";
// vendor/rails/activerecord/test/models/pet_treasure.rb
import { Base } from "../../base.js";

export class PetTreasure extends Base {
  declare pet: Pet | null;
  declare treasure: Treasure | null;
  declare loadBelongsTo: ((name: "pet") => Promise<Pet | null>) &
    ((name: "treasure") => Promise<Treasure | null>);

  static {
    this._tableName = "pets_treasures";
    this.belongsTo("pet");
    this.belongsTo("treasure");
  }
}
