import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet } from "@blazetrails/ruby-compat/include";
import { TopLevel } from "@blazetrails/ruby-compat/object";
import { Base } from "../../lib/base.js";

export class Dashboard extends Base {
  declare dashboard_id: string;
  declare name: string;

  static {
    this.primaryKey = "dashboard_id";
  }
}
constSet(TopLevel, "Dashboard", Dashboard);
DescendantsTracker.registerSubclass(Base, Dashboard);
