// vendor/rails/activerecord/test/models/pet.rb
import { Base } from "../../base.js";

export class Pet extends Base {
  static afterDestroyOutput: any;

  currentUser: any = null;

  static {
    this._primaryKey = "pet_id";
    this.belongsTo("owner", { touch: true });
    this.hasMany("toys");
    this.hasMany("petTreasures");
    this.hasMany("treasures", { through: "petTreasures" });
    this.hasMany("persons", { through: "treasures", source: "looter", sourceType: "Person" });

    this.afterDestroy(function (this: Pet) {
      Pet.afterDestroyOutput = this.currentUser;
    });
  }
}
