// vendor/rails/activerecord/test/models/minivan.rb
import { Base } from "../../base.js";

export class Minivan extends Base {
  static {
    this._primaryKey = "minivan_id";
    this.belongsTo("speedometer");
    this.hasOne("dashboard", { through: "speedometer" });
    this.attrReadonly("color");
  }
}
