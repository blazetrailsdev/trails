import type { Pet } from "./pet.js";
import type { Treasure } from "./treasure.js";
import { Base } from "../../base.js";

export class PetTreasure extends Base {
  declare pet: Pet | null | Promise<Pet | null>;
  declare treasure: Treasure | null | Promise<Treasure | null>;

  static {
    this._tableName = "pets_treasures";
    this.belongsTo("pet");
    this.belongsTo("treasure");
  }
}
