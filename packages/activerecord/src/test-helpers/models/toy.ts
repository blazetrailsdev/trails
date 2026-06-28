import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Relation } from "../../relation.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Pet } from "./pet.js";
import type { Sponsor } from "./sponsor.js";
// vendor/rails/activerecord/test/models/toy.rb
import { Base } from "../../base.js";

export class Toy extends Base {
  declare pet: Pet | null;
  declare sponsors: AssociationProxy<Sponsor>;
  declare static withPet: () => Relation<Toy>;
  declare loadBelongsTo: (name: "pet") => Promise<Pet | null>;
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
  declare name: string;
  declare pet_id: number;
  declare toy_id: number;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static _primaryKey = "toy_id";

  static {
    this.belongsTo("pet");
    this.hasMany("sponsors", { as: "sponsorable", inverseOf: "sponsorable" });
    this.scope("withPet", (q: any) => q.joins("pet"));
  }
}

export class ToyTouchPet extends Base {
  declare name: string;
  declare pet_id: number;
  declare toy_id: number;
  declare loadBelongsTo: (name: "pet") => Promise<Pet | null>;

  static {
    this._primaryKey = "toy_id";
    this.tableName = "toys";
    this.belongsTo("pet", { touch: true });
  }
}
