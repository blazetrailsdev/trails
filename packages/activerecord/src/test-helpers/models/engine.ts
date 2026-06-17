import type { Car } from "./car.js";
// vendor/rails/activerecord/test/models/engine.rb
import { Base } from "../../base.js";

export class Engine extends Base {
  declare myCar: Car | null;
  declare loadBelongsTo: (name: "myCar") => Promise<Car | null>;
  declare car_id: number;

  static {
    this.belongsTo("myCar", {
      className: "Car",
      foreignKey: "car_id",
      counterCache: "engines_count",
    });
  }
}
