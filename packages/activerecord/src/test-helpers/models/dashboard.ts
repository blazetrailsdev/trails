import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "../../base.js";

export class Dashboard extends Base {
  declare dashboard_id: string;
  declare name: string;

  static {
    this.primaryKey = "dashboard_id";
  }
}
registerConstant("Dashboard", Dashboard);
