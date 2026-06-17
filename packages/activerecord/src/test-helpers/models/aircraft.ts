import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Engine } from "./engine.js";
import type { Wheel } from "./wheel.js";
// vendor/rails/activerecord/test/models/aircraft.rb
import { Base } from "../../base.js";

export class Aircraft extends Base {
  declare engines: AssociationProxy<Engine>;
  declare wheels: AssociationProxy<Wheel>;

  static _tableName = "aircraft";

  static {
    this.hasMany("engines", { foreignKey: "car_id" });
    this.hasMany("wheels", { as: "wheelable" });
  }
}
