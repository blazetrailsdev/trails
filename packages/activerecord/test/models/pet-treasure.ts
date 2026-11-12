import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Pet } from "./pet.js";
import type { Treasure } from "./treasure.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class PetTreasure extends Base {
  static {
    this._tableName = "pets_treasures";
    this.belongsTo("pet");
    this.belongsTo("treasure");
  }
}
constSet(TopLevel, "PetTreasure", PetTreasure);
DescendantsTracker.registerSubclass(Base, PetTreasure);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface PetTreasure {
  get pet(): Pet | null | Promise<Pet | null>;
  set pet(value: Pet | null);
  get treasure(): Treasure | null | Promise<Treasure | null>;
  set treasure(value: Treasure | null);
}
