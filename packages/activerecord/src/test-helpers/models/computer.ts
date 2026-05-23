// vendor/rails/activerecord/test/models/computer.rb
import { Base } from "../../base.js";

export class Computer extends Base {
  static {
    this.belongsTo("developer", { foreignKey: "developer" });
    this.hasOne("firm", { through: "developer" });
  }
}
