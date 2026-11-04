import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Dashboard extends Base {
  declare dashboard_id: string;
  declare name: string;

  static {
    this.primaryKey = "dashboard_id";
  }
}
constSet(TopLevel, "Dashboard", Dashboard);
DescendantsTracker.registerSubclass(Base, Dashboard);
