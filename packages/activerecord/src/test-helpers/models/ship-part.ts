// vendor/rails/activerecord/test/models/ship_part.rb
import { Base } from "../../base.js";

export class ShipPart extends Base {
  static {
    this.belongsTo("ship");
    this.hasMany("trinkets", { className: "Treasure", as: "looter" });

    this.validates("name", { presence: true });
  }
}
