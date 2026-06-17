import type { AssociationProxy } from "../../associations/collection-proxy.js";
import type { Dashboard } from "./dashboard.js";
import type { Minivan } from "./minivan.js";
// vendor/rails/activerecord/test/models/speedometer.rb
import { Base } from "../../base.js";

export class Speedometer extends Base {
  declare dashboard: Dashboard | null;
  declare minivans: AssociationProxy<Minivan>;
  declare loadBelongsTo: (name: "dashboard") => Promise<Dashboard | null>;
  declare dashboard_id: string;
  declare name: string;
  declare speedometer_id: string;

  static {
    this._primaryKey = "speedometer_id";
    this.belongsTo("dashboard");
    this.hasMany("minivans");
  }
}
