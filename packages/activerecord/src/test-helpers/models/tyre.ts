import { registerConstant } from "@blazetrails/ruby-compat";
import type { Car } from "./car.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Tyre extends Base {
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
registerConstant("Tyre", Tyre);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Tyre {
  get car(): Car | null | Promise<Car | null>;
  set car(value: Car | null);
}
