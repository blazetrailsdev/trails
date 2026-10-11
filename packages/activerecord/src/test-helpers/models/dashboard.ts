import { Base } from "../../base.js";
import { registerModel } from "../../associations.js";

export class Dashboard extends Base {
  declare dashboard_id: string;
  declare name: string;

  static {
    this.primaryKey = "dashboard_id";
  }
}
registerModel(Dashboard);
