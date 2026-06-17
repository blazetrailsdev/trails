// vendor/rails/activerecord/test/models/dashboard.rb
import { Base } from "../../base.js";

export class Dashboard extends Base {
  declare dashboard_id: string;
  declare name: string;

  static _primaryKey = "dashboard_id";
}
