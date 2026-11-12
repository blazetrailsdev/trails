import { DescendantsTracker } from "@blazetrails/activesupport";
import { constSet, TopLevel } from "@blazetrails/ruby-compat";
import type { Car } from "./car.js";
import { Base } from "../../lib/base.js";

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
constSet(TopLevel, "Tyre", Tyre);
DescendantsTracker.registerSubclass(Base, Tyre);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Tyre {
  get car(): Car | null | Promise<Car | null>;
  set car(value: Car | null);
}
