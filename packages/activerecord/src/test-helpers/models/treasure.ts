import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Parrot } from "./parrot.js";
import type { PriceEstimate } from "./price-estimate.js";
import type { RichPerson } from "./person.js";
import type { Ship } from "./ship.js";
import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Treasure extends Base {
  declare parrots: AssociationProxy<Parrot>;
  declare priceEstimates: AssociationProxy<PriceEstimate>;
  declare richPeople: AssociationProxy<RichPerson>;
  declare looter_id: number;
  declare looter_type: string;
  declare name: string;
  declare ship_id: number;
  declare "type": string;

  static {
    this.hasAndBelongsToMany("parrots");
    this.belongsTo("looter", { polymorphic: true });
    this.belongsTo("ship");
    this.hasMany("priceEstimates", { as: "estimateOf", autosave: true });
    this.hasAndBelongsToMany("richPeople", { joinTable: "peoples_treasures", validate: false });
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Treasure {
  get looter(): Base | null | Promise<Base | null>;
  set looter(value: Base | null);
  get ship(): Ship | null | Promise<Ship | null>;
  set ship(value: Ship | null);
}

export class HiddenTreasure extends Treasure {}

registerModel(Treasure);
registerModel(HiddenTreasure);
