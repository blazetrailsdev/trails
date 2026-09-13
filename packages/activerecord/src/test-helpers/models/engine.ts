import type { Car } from "./car.js";
import { Base } from "../../base.js";

export class Engine extends Base {
  declare myCar: Car | null;
  declare car_id: number;

  static {
    this.belongsTo("myCar", {
      className: "Car",
      foreignKey: "car_id",
      counterCache: "engines_count",
    });
  }
}
