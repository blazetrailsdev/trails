// vendor/rails/activerecord/test/models/pet.rb
import { Base } from "../../base.js";

export class Pet extends Base {
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
