import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Car } from "./car.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Engine extends Base {
  declare car_id: number;

  static {
    this.belongsTo("myCar", {
      className: "Car",
      foreignKey: "car_id",
      counterCache: "engines_count",
    });
  }
}
constSet(TopLevel, "Engine", Engine);
DescendantsTracker.registerSubclass(Base, Engine);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Engine {
  get myCar(): Car | null | Promise<Car | null>;
  set myCar(value: Car | null);
}
