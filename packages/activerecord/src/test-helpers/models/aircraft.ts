// vendor/rails/activerecord/test/models/aircraft.rb
import { Base } from "../../base.js";

export class Aircraft extends Base {
  static _tableName = "aircraft";

  static {
    this.hasMany("engines", { foreignKey: "car_id" });
    this.hasMany("wheels", { as: "wheelable" });
  }
}
