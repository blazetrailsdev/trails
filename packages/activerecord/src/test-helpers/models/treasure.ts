import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Parrot } from "./parrot.js";
import type { PriceEstimate } from "./price-estimate.js";
import type { RichPerson } from "./person.js";
import type { Ship } from "./ship.js";
// vendor/rails/activerecord/test/models/treasure.rb
import { Base } from "../../base.js";

export class Treasure extends Base {
  declare parrots: AssociationProxy<Parrot>;
  declare looter: Base | null;
  declare ship: Ship | null;
  declare priceEstimates: AssociationProxy<PriceEstimate>;
  declare richPeople: AssociationProxy<RichPerson>;
  declare loadBelongsTo: ((name: "looter") => Promise<Base | null>) &
    ((name: "ship") => Promise<Ship | null>);
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

export class HiddenTreasure extends Treasure {}
