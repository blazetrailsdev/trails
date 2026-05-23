// vendor/rails/activerecord/test/models/engine.rb
import { Base } from "../../base.js";

export class Engine extends Base {
  static {
    this.belongsTo("myCar", {
      className: "Car",
      foreignKey: "car_id",
      counterCache: "engines_count",
    });
  }
}
