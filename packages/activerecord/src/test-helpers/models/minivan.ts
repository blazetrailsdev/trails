import type { Dashboard } from "./dashboard.js";
import type { Speedometer } from "./speedometer.js";
import { Base } from "../../base.js";

export class Minivan extends Base {
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
export interface Minivan {
  get speedometer(): Speedometer | null | Promise<Speedometer | null>;
  set speedometer(value: Speedometer | null);
  get dashboard(): Dashboard | null | Promise<Dashboard | null>;
  set dashboard(value: Dashboard | null);
}
