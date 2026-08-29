import type { Car } from "./car.js";
import { Base } from "../../base.js";

export class Tyre extends Base {
  declare car: Car | null;
  declare loadBelongsTo: (name: "car") => Promise<Car | null>;
  declare car_id: number;

  static {
    this.belongsTo("car", { counterCache: "custom_tyres_count" });
  }

  static customFind(id: any) {
    return this.find(id);
  }

  static customFindBy(args: any) {
    return this.findBy(args);
  }
}
