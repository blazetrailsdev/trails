import type { Pet } from "./pet.js";
import type { Treasure } from "./treasure.js";
import { Base } from "../../base.js";

export class PetTreasure extends Base {
  static {
    this._tableName = "pets_treasures";
    this.belongsTo("pet");
    this.belongsTo("treasure");
  }
}
export interface PetTreasure {
  get pet(): Pet | null | Promise<Pet | null>;
  set pet(value: Pet | null);
  get treasure(): Treasure | null | Promise<Treasure | null>;
  set treasure(value: Treasure | null);
}
