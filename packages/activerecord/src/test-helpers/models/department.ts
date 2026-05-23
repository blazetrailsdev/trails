// vendor/rails/activerecord/test/models/department.rb
import { Base } from "../../base.js";

export class Department extends Base {
  static {
    this.hasMany("chefs");
    this.belongsTo("hotel");
  }
}
