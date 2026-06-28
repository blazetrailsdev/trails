import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Temporal } from "@blazetrails/activesupport/temporal";
import type { Owner } from "./owner.js";
import type { Person } from "./person.js";
import type { PetTreasure } from "./pet-treasure.js";
import type { Toy } from "./toy.js";
import type { Treasure } from "./treasure.js";
// vendor/rails/activerecord/test/models/pet.rb
import { Base } from "../../base.js";

export class Pet extends Base {
  declare current_user: string;
  declare owner: Owner | null;
  declare toys: AssociationProxy<Toy>;
  declare petTreasures: AssociationProxy<PetTreasure>;
  declare treasures: AssociationProxy<Treasure>;
  declare persons: AssociationProxy<Person>;
  declare loadBelongsTo: (name: "owner") => Promise<Owner | null>;
  declare created_at: Temporal.Instant | Temporal.PlainDateTime;
  declare integer: number | null;
  declare name: string;
  declare owner_id: number;
  declare pet_id: number;
  declare updated_at: Temporal.Instant | Temporal.PlainDateTime;

  static afterDestroyOutput: any;

  static {
    this._primaryKey = "pet_id";
    // Rails: `attr_accessor :current_user` — a non-persisted accessor that
    // nested attributes can assign before the record is destroyed.
    this.attribute("current_user", "string", { virtual: true });
    this.belongsTo("owner", { touch: true });
    this.hasMany("toys");
    this.hasMany("petTreasures");
    this.hasMany("treasures", { through: "petTreasures" });
    this.hasMany("persons", { through: "treasures", source: "looter", sourceType: "Person" });

    this.afterDestroy(function (record: Pet) {
      Pet.afterDestroyOutput = record.readAttribute("current_user");
    });
  }
}

export class PetTouchHappyAt extends Base {
  declare name: string;
  declare owner_id: number;
  declare pet_id: number;
  declare loadBelongsTo: (name: "owner") => Promise<Owner | null>;

  static {
    this._primaryKey = "pet_id";
    this.tableName = "pets";
    this.belongsTo("owner", { touch: "happy_at" });
  }
}

export class PetCounterCacheTouch extends Base {
  declare name: string;
  declare owner_id: number;
  declare pet_id: number;
  declare loadBelongsTo: (name: "owner") => Promise<Owner | null>;

  static {
    this._primaryKey = "pet_id";
    this.tableName = "pets";
    this.belongsTo("owner", { counterCache: "use_count", touch: true });
  }
}
