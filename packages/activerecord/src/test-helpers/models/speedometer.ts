import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Dashboard } from "./dashboard.js";
import type { Minivan } from "./minivan.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Speedometer extends Base {
  declare minivans: AssociationProxy<Minivan>;
  declare dashboard_id: string;
  declare name: string;
  declare speedometer_id: string;

  static {
    this._primaryKey = "speedometer_id";
    this.belongsTo("dashboard");
    this.hasMany("minivans");
  }
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Speedometer {
  get dashboard(): Dashboard | null | Promise<Dashboard | null>;
  set dashboard(value: Dashboard | null);
}
