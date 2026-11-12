import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { AssociationProxy } from "../../lib/associations/collection-proxy.js";
import type { Dashboard } from "./dashboard.js";
import type { Minivan } from "./minivan.js";
import { Base } from "../../lib/base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Speedometer extends Base {
  declare minivans: AssociationProxy<Minivan>;
  declare dashboard_id: string;
  declare name: string;
  declare speedometer_id: string;

  static {
    this.primaryKey = "speedometer_id";
    this.belongsTo("dashboard");
    this.hasMany("minivans");
  }
}
constSet(TopLevel, "Speedometer", Speedometer);
DescendantsTracker.registerSubclass(Base, Speedometer);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Speedometer {
  get dashboard(): Dashboard | null | Promise<Dashboard | null>;
  set dashboard(value: Dashboard | null);
}
