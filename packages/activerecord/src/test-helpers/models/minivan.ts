import type { Dashboard } from "./dashboard.js";
import type { Speedometer } from "./speedometer.js";
// vendor/rails/activerecord/test/models/minivan.rb
import { Base } from "../../base.js";

export class Minivan extends Base {
  declare speedometer: Speedometer | null;
  declare dashboard: Dashboard | null;
  declare loadBelongsTo: (name: "speedometer") => Promise<Speedometer | null>;
  declare loadHasOne: (name: "dashboard") => Promise<Dashboard | null>;
  declare color: string;
  declare minivan_id: string;
  declare name: string;
  declare speedometer_id: string;

  static {
    this._primaryKey = "minivan_id";
    this.belongsTo("speedometer");
    this.hasOne("dashboard", { through: "speedometer" });
    this.attrReadonly("color");
  }
}
