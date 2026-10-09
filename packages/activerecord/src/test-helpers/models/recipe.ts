import { registerConstant } from "@blazetrails/ruby-compat";
import type { Chef } from "./chef.js";
import { Base } from "../../base.js";

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Recipe extends Base {
  declare chef_id: number;
  declare hotel_id: number;

  static {
    this.belongsTo("chef");
  }
}
registerConstant("Recipe", Recipe);
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Recipe {
  get chef(): Chef | null | Promise<Chef | null>;
  set chef(value: Chef | null);
}
