// vendor/rails/activerecord/test/models/speedometer.rb
import { Base } from "../../base.js";

export class Speedometer extends Base {
  static {
    this._primaryKey = "speedometer_id";
    this.belongsTo("dashboard");
    this.hasMany("minivans");
  }
}
